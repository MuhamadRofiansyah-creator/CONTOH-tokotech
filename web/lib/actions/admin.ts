"use server"

import { randomBytes } from "node:crypto"
import { updateTag } from "next/cache"
import { db } from "@/lib/db"
import { Prisma } from "@/lib/generated/prisma/client"
import { requireStaff, type SessionUser } from "@/lib/auth/session"
import { syncTotalStock } from "@/lib/orders/settle"
import { bookShipment } from "@/lib/shipping"
import { midtransEnabled, refundTransaction } from "@/lib/payments/midtrans"
import { sendBackInStock, sendShipped, sendStaffInvite } from "@/lib/email"
import { courierLabel } from "@/lib/format"
import type { ProductStatus, Role, VoucherType } from "@/lib/types"

// Admin writes. Every action re-checks the role (proxy.ts is only the first gate),
// records an AuditLog row and refreshes the cache tags it touched (updateTag gives
// read-your-own-writes in the admin UI).

export type AdminResult = { ok: true; message?: string } | { ok: false; error: string }

const ok = (message?: string): AdminResult => ({ ok: true, message })
const fail = (error: string): AdminResult => ({ ok: false, error })

async function audit(actor: SessionUser, action: string, entity: string, entityId: string, changes?: Record<string, [unknown, unknown]>) {
  await db.auditLog.create({ data: { actorId: actor.id, action, entity, entityId, changes: (changes ?? undefined) as Prisma.InputJsonValue | undefined } })
}

function refresh(...tags: string[]) {
  for (const t of new Set(["admin", ...tags])) updateTag(t)
}

const int = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""))
  return Number.isFinite(n) ? Math.round(n) : NaN
}
const str = (v: FormDataEntryValue | null, max = 500) => String(v ?? "").trim().slice(0, max)
const slugify = (s: string) => s.toLowerCase().replace(/["″]/g, "in").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80)
const STATUSES: ProductStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"]

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/** Create or update a product. For multi-variant products, price/stock edits apply to the first variant. */
export async function saveProductAction(productId: string | null, form: FormData): Promise<AdminResult> {
  const actor = await requireStaff()
  const name = str(form.get("name"), 120)
  const description = str(form.get("description"), 4000)
  const price = int(form.get("price"))
  const compareRaw = str(form.get("compareAt"))
  const compareAt = compareRaw ? int(compareRaw) : null
  const stock = int(form.get("stock"))
  const sku = str(form.get("sku"), 40).toUpperCase()
  const status = str(form.get("status")) as ProductStatus
  const [brand, category] = await Promise.all([
    db.brand.findUnique({ where: { slug: str(form.get("brand")) } }),
    db.category.findFirst({ where: { name: str(form.get("category")) } }),
  ])

  if (name.length < 3) return fail("Enter a product name")
  if (!brand || !category) return fail("Choose a brand and category")
  if (!(price > 0)) return fail("Enter a price above Rp 0")
  if (compareAt != null && !(compareAt > price)) return fail("Compare-at price must be higher than the price")
  if (!(stock >= 0)) return fail("Stock can't be negative")
  if (!STATUSES.includes(status)) return fail("Choose a status")
  if (!/^[A-Z0-9-]{3,40}$/.test(sku)) return fail("SKU: 3–40 letters, digits or dashes")

  try {
    if (!productId) {
      const base = slugify(name)
      const slug = (await db.product.findUnique({ where: { slug: base } })) ? `${base}-${randomBytes(2).toString("hex")}` : base
      const created = await db.$transaction(async (tx) => {
        const p = await tx.product.create({
          data: {
            slug, name, description: description || name, status, brandId: brand.id, categoryId: category.id,
            priceFrom: price, compareAtFrom: compareAt, totalStock: stock, accent: brand.color, publishedAt: status === "ACTIVE" ? new Date() : null,
            variants: { create: { sku, name: "Default", price, compareAtPrice: compareAt, stock, weightGrams: 1000 } },
          },
          include: { variants: true },
        })
        if (stock > 0) await tx.inventoryMovement.create({ data: { variantId: p.variants[0].id, delta: stock, reason: "RESTOCK", actorId: actor.id, note: "Initial stock" } })
        return p
      })
      await audit(actor, "product.create", "Product", created.id, { name: [null, name], priceFrom: [null, price] })
      refresh("catalog")
      return ok(`Created ${name}`)
    }

    const before = await db.product.findUnique({ where: { id: productId }, include: { variants: { orderBy: { position: "asc" } } } })
    if (!before) return fail("Product not found")
    const v = before.variants[0]
    const skuTaken = sku !== v.sku && (await db.productVariant.findUnique({ where: { sku } }))
    if (skuTaken) return fail("Another variant already uses that SKU")
    // Stock field shows sellable units (stock − reserved); keep reservations intact
    const newOnHand = stock + v.reserved
    const delta = newOnHand - v.stock

    await db.$transaction(async (tx) => {
      await tx.productVariant.update({ where: { id: v.id }, data: { sku, price, compareAtPrice: compareAt, stock: newOnHand } })
      if (delta !== 0) await tx.inventoryMovement.create({ data: { variantId: v.id, delta, reason: "ADJUSTMENT", actorId: actor.id, note: "Admin edit" } })
      const variants = await tx.productVariant.findMany({ where: { productId, isActive: true } })
      const cheapest = variants.reduce((a, b) => (b.price < a.price ? b : a), variants[0])
      await tx.product.update({
        where: { id: productId },
        data: {
          name, description: description || before.description, status, brandId: brand.id, categoryId: category.id,
          priceFrom: cheapest.price, compareAtFrom: cheapest.compareAtPrice,
          publishedAt: status === "ACTIVE" ? (before.publishedAt ?? new Date()) : before.publishedAt,
        },
      })
      await syncTotalStock(tx, [productId])
    })
    const changes: Record<string, [unknown, unknown]> = {}
    if (before.name !== name) changes.name = [before.name, name]
    if (v.price !== price) changes.price = [v.price, price]
    if (before.status !== status) changes.status = [before.status, status]
    if (delta) changes.stock = [v.stock, newOnHand]
    await audit(actor, "product.update", "Product", productId, changes)
    if (before.totalStock === 0 && stock > 0) await notifyBackInStock(productId)
    refresh("catalog", `product:${before.slug}`)
    return ok("Changes saved")
  } catch (e) {
    console.error(e)
    return fail("Couldn't save the product")
  }
}

/** Email everyone waiting for this product, once. */
async function notifyBackInStock(productId: string) {
  const alerts = await db.stockAlert.findMany({
    where: { productId, notifiedAt: null },
    include: { user: { select: { email: true } }, product: { select: { name: true, slug: true, status: true } } },
  })
  for (const a of alerts) {
    if (a.product.status !== "ACTIVE") continue
    await sendBackInStock(a.user.email, a.product.name, a.product.slug)
    await db.stockAlert.update({ where: { id: a.id }, data: { notifiedAt: new Date() } })
  }
}

/** Set status for several products (bulk actions; "delete" archives so order history keeps its links). */
export async function setProductStatusAction(ids: string[], status: ProductStatus): Promise<AdminResult> {
  const actor = await requireStaff()
  if (!STATUSES.includes(status) || !ids.length) return fail("Nothing to update")
  const products = await db.product.findMany({ where: { id: { in: ids.slice(0, 200) } }, select: { id: true, status: true, slug: true, publishedAt: true } })
  await db.$transaction(
    products.map((p) =>
      db.product.update({ where: { id: p.id }, data: { status, publishedAt: status === "ACTIVE" ? (p.publishedAt ?? new Date()) : p.publishedAt } }),
    ),
  )
  for (const p of products) if (p.status !== status) await audit(actor, "product.status", "Product", p.id, { status: [p.status, status] })
  refresh("catalog", ...products.map((p) => `product:${p.slug}`))
  return ok(`${products.length} product${products.length === 1 ? "" : "s"} ${status === "ARCHIVED" ? "archived" : `set to ${status.toLowerCase()}`}`)
}

// ---------------------------------------------------------------------------
// Payments, refunds, fulfilment
// ---------------------------------------------------------------------------

/** Full refund of a paid payment. Unshipped orders are cancelled and restocked; shipped ones become RETURNED. */
export async function refundPaymentAction(paymentId: string, reason: string): Promise<AdminResult> {
  const actor = await requireStaff({ admin: true })
  const payment = await db.payment.findUnique({ where: { id: paymentId }, include: { order: { include: { items: true } } } })
  if (!payment) return fail("Payment not found")
  if (payment.status !== "PAID") return fail("Only paid payments can be refunded")
  const why = reason.trim().slice(0, 255) || "Refund issued by admin"

  let gatewayRef = `manual-${randomBytes(6).toString("hex")}`
  if (midtransEnabled() && payment.gateway === "midtrans" && (payment.method === "CREDIT_CARD" || payment.method === "EWALLET")) {
    try {
      gatewayRef = (await refundTransaction(payment.number, payment.amount, why, `rf-${payment.number}-${Date.now()}`)).gatewayRef
    } catch (e) {
      return fail(`Midtrans refused the refund: ${(e as Error).message}`)
    }
  }

  const order = payment.order
  const shipped = order.status === "SHIPPED" || order.status === "DELIVERED"
  await db.$transaction(async (tx) => {
    await tx.refund.create({ data: { paymentId: payment.id, amount: payment.amount, reason: why, status: "SUCCEEDED", gatewayRef, issuedById: actor.id } })
    await tx.payment.update({ where: { id: payment.id }, data: { status: "REFUNDED" } })
    if (shipped) {
      await tx.order.update({ where: { id: order.id }, data: { status: "RETURNED" } })
      await tx.orderEvent.create({ data: { orderId: order.id, status: "RETURNED", message: `Refunded: ${why}`, actorId: actor.id } })
    } else {
      // Not shipped yet: the units go back on the shelf
      for (const it of order.items) {
        if (!it.variantId) continue
        await tx.productVariant.update({ where: { id: it.variantId }, data: { stock: { increment: it.quantity } } })
        await tx.inventoryMovement.create({ data: { variantId: it.variantId, delta: it.quantity, reason: "RETURN", orderId: order.id, actorId: actor.id, note: "Refunded before shipping" } })
        await tx.product.update({ where: { id: it.productId }, data: { soldCount: { decrement: it.quantity } } })
      }
      await syncTotalStock(tx, [...new Set(order.items.map((i) => i.productId))])
      await tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: new Date() } })
      await tx.orderEvent.create({ data: { orderId: order.id, status: "CANCELLED", message: `Refunded before shipping: ${why}`, actorId: actor.id } })
    }
  })
  await audit(actor, "payment.refund", "Payment", payment.id, { status: ["PAID", "REFUNDED"], amount: [null, payment.amount] })
  refresh("catalog", ...(order.userId ? [`orders:${order.userId}`] : []))
  return ok(`Refunded ${payment.number}${midtransEnabled() && gatewayRef.startsWith("manual") ? " (bank transfer: send the money back manually)" : ""}`)
}

/** Paid order → book the courier pickup (Biteship or mock waybill) → SHIPPED, email the customer. */
export async function shipOrderAction(orderNumber: string): Promise<AdminResult> {
  const actor = await requireStaff()
  const order = await db.order.findUnique({ where: { number: orderNumber }, include: { items: { include: { variant: true } }, shipments: true } })
  if (!order) return fail("Order not found")
  if (order.status !== "PAID" && order.status !== "PROCESSING") return fail(`Order is ${order.status.toLowerCase().replace("_", " ")}, not ready to ship`)
  const shipment = order.shipments[0]
  if (!shipment) return fail("No shipping method on this order")
  try {
    const booked = await bookShipment({
      orderNumber: order.number,
      courier: shipment.courier,
      service: shipment.service,
      recipient: {
        name: order.shipRecipient, phone: order.shipPhone, postalCode: order.shipPostalCode, note: order.shipNotes,
        address: `${order.shipStreet}, ${order.shipDistrict}, ${order.shipCity}, ${order.shipProvince}`,
        latitude: order.shipLatitude, longitude: order.shipLongitude,
      },
      items: order.items.map((i) => ({
        name: i.productName, value: i.unitPrice, quantity: i.quantity,
        weightGrams: i.variant?.weightGrams ?? 1000, lengthCm: i.variant?.lengthCm ?? null, widthCm: i.variant?.widthCm ?? null, heightCm: i.variant?.heightCm ?? null,
      })),
    })
    const now = new Date()
    await db.$transaction([
      db.shipment.update({ where: { id: shipment.id }, data: { externalId: booked.externalId, trackingNumber: booked.trackingNumber, status: "IN_TRANSIT", shippedAt: now } }),
      db.order.update({ where: { id: order.id }, data: { status: "SHIPPED" } }),
      db.orderEvent.create({ data: { orderId: order.id, status: "SHIPPED", message: `Handed to ${courierLabel(shipment.courier, shipment.service)}${booked.trackingNumber ? ` (waybill ${booked.trackingNumber})` : ""}`, actorId: actor.id } }),
    ])
    await audit(actor, "order.ship", "Order", order.id, { status: [order.status, "SHIPPED"] })
    await sendShipped(order, courierLabel(shipment.courier, shipment.service), booked.trackingNumber)
    refresh(...(order.userId ? [`orders:${order.userId}`] : []))
    return ok(`Shipped ${order.number}${booked.trackingNumber ? ` · waybill ${booked.trackingNumber}` : ""}`)
  } catch (e) {
    console.error(e)
    return fail(`Courier booking failed: ${(e as Error).message}`)
  }
}

/** Mark a shipped order delivered (normally the tracking webhook does this). */
export async function markDeliveredAction(orderNumber: string): Promise<AdminResult> {
  const actor = await requireStaff()
  const order = await db.order.findUnique({ where: { number: orderNumber }, include: { shipments: true } })
  if (!order || order.status !== "SHIPPED") return fail("Only shipped orders can be marked delivered")
  const now = new Date()
  await db.$transaction([
    db.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } }),
    db.shipment.updateMany({ where: { orderId: order.id }, data: { status: "DELIVERED", deliveredAt: now } }),
    db.orderEvent.create({ data: { orderId: order.id, status: "DELIVERED", message: "Delivered (confirmed by staff)", actorId: actor.id } }),
  ])
  await audit(actor, "order.deliver", "Order", order.id, { status: ["SHIPPED", "DELIVERED"] })
  refresh(...(order.userId ? [`orders:${order.userId}`] : []))
  return ok(`${order.number} marked delivered`)
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export async function setUserRoleAction(userId: string, role: Role): Promise<AdminResult> {
  const actor = await requireStaff({ admin: true })
  if (!["CUSTOMER", "STAFF", "ADMIN"].includes(role)) return fail("Unknown role")
  if (userId === actor.id) return fail("You can't change your own role")
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return fail("User not found")
  await db.user.update({ where: { id: userId }, data: { role } })
  await audit(actor, "user.role_change", "User", userId, { role: [user.role, role] })
  refresh()
  return ok(`${user.name ?? user.email} is now ${role.toLowerCase()} (applies at their next sign-in)`)
}

export async function setUserSuspendedAction(userId: string, suspended: boolean): Promise<AdminResult> {
  const actor = await requireStaff({ admin: true })
  if (userId === actor.id) return fail("You can't suspend yourself")
  const user = await db.user.findUnique({ where: { id: userId } })
  if (!user) return fail("User not found")
  const status = suspended ? "SUSPENDED" : "ACTIVE"
  await db.user.update({ where: { id: userId }, data: { status } })
  await audit(actor, suspended ? "user.suspend" : "user.reactivate", "User", userId, { status: [user.status, status] })
  refresh()
  return ok(`${user.name ?? user.email} ${suspended ? "suspended" : "reactivated"}`)
}

export async function inviteStaffAction(form: FormData): Promise<AdminResult> {
  const actor = await requireStaff({ admin: true })
  const email = str(form.get("email"), 254).toLowerCase()
  const role = str(form.get("role")) as Role
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Enter a valid email")
  if (role !== "STAFF" && role !== "ADMIN") return fail("Choose a role")
  const existing = await db.user.findUnique({ where: { email } })
  if (existing && existing.status !== "INVITED") return fail("That person already has an account; change their role instead")
  const user = existing
    ? await db.user.update({ where: { id: existing.id }, data: { role } })
    : await db.user.create({ data: { email, role, status: "INVITED", name: email.split("@")[0] } })
  const token = randomBytes(24).toString("base64url")
  await db.verificationToken.create({ data: { identifier: email, token, expires: new Date(Date.now() + 7 * 86_400_000) } })
  await sendStaffInvite(email, role, token)
  await audit(actor, "user.invite", "User", user.id, { role: [null, role] })
  refresh()
  return ok(`Invitation sent to ${email}`)
}

// ---------------------------------------------------------------------------
// Reviews (moderation keeps Product.ratingAvg/ratingCount in step incrementally)
// ---------------------------------------------------------------------------

export async function moderateReviewAction(reviewId: string, decision: "PUBLISHED" | "HIDDEN", note?: string): Promise<AdminResult> {
  const actor = await requireStaff()
  const review = await db.review.findUnique({ where: { id: reviewId }, include: { product: { select: { id: true, slug: true, ratingAvg: true, ratingCount: true } } } })
  if (!review) return fail("Review not found")
  if (review.status === decision) return ok()
  const p = review.product
  let { ratingAvg: avg, ratingCount: count } = p
  if (decision === "PUBLISHED") {
    avg = (avg * count + review.rating) / (count + 1)
    count += 1
  } else if (review.status === "PUBLISHED") {
    avg = count > 1 ? (avg * count - review.rating) / (count - 1) : 0
    count = Math.max(0, count - 1)
  }
  await db.$transaction([
    db.review.update({ where: { id: reviewId }, data: { status: decision, moderatedById: actor.id, moderatedAt: new Date(), moderationNote: decision === "HIDDEN" ? (note?.trim().slice(0, 300) || "Hidden by staff") : null } }),
    db.product.update({ where: { id: p.id }, data: { ratingAvg: Math.round(avg * 100) / 100, ratingCount: count } }),
  ])
  await audit(actor, `review.${decision === "PUBLISHED" ? "publish" : "hide"}`, "Review", reviewId, { status: [review.status, decision] })
  refresh("catalog", `reviews:${p.id}`, `product:${p.slug}`)
  return ok(decision === "PUBLISHED" ? "Review published" : "Review hidden")
}

// ---------------------------------------------------------------------------
// Vouchers & flash sales
// ---------------------------------------------------------------------------

export async function createVoucherAction(form: FormData): Promise<AdminResult> {
  const actor = await requireStaff()
  const code = str(form.get("code"), 40).toUpperCase()
  const type = str(form.get("type")) as VoucherType
  const value = type === "FREE_SHIPPING" ? 0 : int(form.get("value"))
  const maxDiscount = str(form.get("maxDiscount")) ? int(form.get("maxDiscount")) : null
  const minSubtotal = str(form.get("minSubtotal")) ? int(form.get("minSubtotal")) : 0
  const usageLimit = str(form.get("usageLimit")) ? int(form.get("usageLimit")) : null
  const perUserLimit = str(form.get("perUserLimit")) ? int(form.get("perUserLimit")) : 1
  const endsAt = str(form.get("endsAt")) ? new Date(`${str(form.get("endsAt"))}T23:59:59+07:00`) : null
  if (!/^[A-Z0-9]{4,20}$/.test(code)) return fail("Code: 4–20 letters or digits")
  if (!["PERCENT", "FIXED", "FREE_SHIPPING"].includes(type)) return fail("Choose a type")
  if (type === "PERCENT" && !(value >= 1 && value <= 100)) return fail("Percent must be 1–100")
  if (type === "FIXED" && !(value > 0)) return fail("Enter the discount amount")
  if (!(perUserLimit >= 1)) return fail("Per-customer limit must be at least 1")
  if (await db.voucher.findUnique({ where: { code } })) return fail("That code already exists")
  const v = await db.voucher.create({
    data: { code, type, value, maxDiscount: type === "PERCENT" ? maxDiscount : null, minSubtotal, usageLimit, perUserLimit, endsAt, startsAt: new Date(), description: str(form.get("description"), 120) || null },
  })
  await audit(actor, "voucher.create", "Voucher", v.id, { code: [null, code] })
  refresh()
  return ok(`Voucher ${code} created`)
}

export async function setVoucherActiveAction(voucherId: string, isActive: boolean): Promise<AdminResult> {
  const actor = await requireStaff()
  const v = await db.voucher.update({ where: { id: voucherId }, data: { isActive } })
  await audit(actor, isActive ? "voucher.activate" : "voucher.deactivate", "Voucher", voucherId, { isActive: [!isActive, isActive] })
  refresh()
  return ok(`${v.code} ${isActive ? "activated" : "deactivated"}`)
}

export async function setFlashSaleActiveAction(flashSaleId: string, isActive: boolean): Promise<AdminResult> {
  const actor = await requireStaff()
  const s = await db.flashSale.update({ where: { id: flashSaleId }, data: { isActive } })
  await audit(actor, isActive ? "flash_sale.activate" : "flash_sale.deactivate", "FlashSale", flashSaleId, { isActive: [!isActive, isActive] })
  refresh("catalog")
  return ok(`${s.name} ${isActive ? "activated" : "paused"}`)
}

/** New flash sale: the most-discounted live variants at their current price, for `hours` from now. */
export async function createFlashSaleAction(form: FormData): Promise<AdminResult> {
  const actor = await requireStaff()
  const name = str(form.get("name"), 80) || "Flash Sale"
  const hours = Math.min(168, Math.max(1, int(form.get("hours")) || 24))
  const quota = Math.max(1, int(form.get("quota")) || 20)
  const variantIds = String(form.get("variantIds") ?? "").split(",").filter(Boolean).slice(0, 20)
  if (!variantIds.length) return fail("Pick at least one product")
  const variants = await db.productVariant.findMany({ where: { id: { in: variantIds }, isActive: true, product: { status: "ACTIVE" } } })
  const startsAt = new Date()
  const sale = await db.flashSale.create({
    data: {
      name, startsAt, endsAt: new Date(startsAt.getTime() + hours * 3_600_000),
      items: { create: variants.map((v) => ({ variantId: v.id, salePrice: v.price, quota })) },
    },
  })
  await audit(actor, "flash_sale.create", "FlashSale", sale.id, { items: [null, variants.length] })
  refresh("catalog")
  return ok(`${name} is live for ${hours}h with ${variants.length} products`)
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

const ART_KINDS = ["desktop", "laptop", "monitor", "keyboard", "mouse", "headset", "gpu"]

/** Create or update a category's text, URL slug, art and menu position. Spec filters (facets) are kept as they are. */
export async function saveCategoryAction(categoryId: string | null, form: FormData): Promise<AdminResult> {
  const actor = await requireStaff()
  const name = str(form.get("name"), 60)
  const slug = slugify(str(form.get("slug"), 60) || name)
  const tagline = str(form.get("tagline"), 120) || null
  const description = str(form.get("description"), 500) || null
  // Hero title: a line break in the textarea becomes the hero's line break
  const heroTitle = str(form.get("heroTitle"), 80).replace(/\r/g, "") || null
  const heroSubtitle = str(form.get("heroSubtitle"), 120) || null
  const art = str(form.get("art"))
  const position = int(form.get("position"))

  if (name.length < 2) return fail("Enter a name")
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return fail("URL slug: lowercase letters, digits and dashes")
  if (!ART_KINDS.includes(art)) return fail("Choose an illustration")
  const clash = await db.category.findFirst({ where: { slug, ...(categoryId ? { id: { not: categoryId } } : {}) }, select: { name: true } })
  if (clash) return fail(`The URL /c/${slug} is already used by ${clash.name}`)

  const data = { name, slug, tagline, description, heroTitle, heroSubtitle, art, position: Number.isFinite(position) ? position : 0 }
  if (!categoryId) {
    const created = await db.category.create({ data: { ...data, id: `c-${slug}`.slice(0, 40), facets: [] } })
    await audit(actor, "category.create", "Category", created.id, { name: [null, name] })
    refresh("catalog")
    return ok(`Created ${name} at /c/${slug}`)
  }

  const before = await db.category.findUnique({ where: { id: categoryId } })
  if (!before) return fail("Category not found")
  await db.category.update({ where: { id: categoryId }, data })
  const changes: Record<string, [unknown, unknown]> = {}
  for (const k of Object.keys(data) as (keyof typeof data)[]) if (before[k] !== data[k]) changes[k] = [before[k], data[k]]
  await audit(actor, "category.update", "Category", categoryId, changes)
  refresh("catalog")
  return ok(before.slug !== slug ? `Saved. The page moved from /c/${before.slug} to /c/${slug}` : "Category saved")
}

/** Delete a category that has no products (move or archive its products first). */
export async function deleteCategoryAction(categoryId: string): Promise<AdminResult> {
  const actor = await requireStaff({ admin: true })
  const category = await db.category.findUnique({ where: { id: categoryId }, include: { _count: { select: { products: true, children: true } } } })
  if (!category) return fail("Category not found")
  if (category._count.products > 0) return fail(`${category.name} still has ${category._count.products} products (including drafts and archived). Move them first.`)
  if (category._count.children > 0) return fail(`${category.name} has subcategories`)
  await db.category.delete({ where: { id: categoryId } })
  await audit(actor, "category.delete", "Category", categoryId, { name: [category.name, null] })
  refresh("catalog")
  return ok(`Deleted ${category.name}`)
}
