"use strict";

const pool = require("../db");
const { logAudit } = require("../utils/audit");
const { notifyLowStock } = require("../utils/notifications");

function businessIdFrom(req) {
    const value = Number(
        req.businessId || req.user?.businessId || req.user?.business_id
    );

    return Number.isInteger(value) && value > 0 ? value : null;
}

function validateProductId(value) {
    const id = Number(value);
    return Number.isInteger(id) && id > 0 ? id : null;
}

function input(body = {}) {
    return {
        name: String(body.name ?? "").trim(),
        buyingPrice: Number(body.buyingPrice),
        sellingPrice: Number(body.sellingPrice),
        stockQuantity: Number(body.stockQuantity),
        lowStockThreshold: Number(body.lowStockThreshold),
        sku: String(body.sku ?? "").trim() || null,
        barcode: String(body.barcode ?? "").trim() || null,
        category: String(body.category ?? "").trim() || null,
        unit: String(body.unit ?? "pcs").trim() || "pcs",
        imageKey: String(body.imageKey ?? "").trim() || null,
        imageUrl: String(body.imageUrl ?? "").trim() || null
    };
}

function validateProductInput(data) {
    if (data.name.length < 2 || data.name.length > 150) {
        return "Product name must be between 2 and 150 characters.";
    }

    if (!Number.isFinite(data.buyingPrice) || data.buyingPrice < 0) {
        return "Buying price must be a valid non-negative number.";
    }

    if (!Number.isFinite(data.sellingPrice) || data.sellingPrice < 0) {
        return "Selling price must be a valid non-negative number.";
    }

    if (!Number.isInteger(data.stockQuantity) || data.stockQuantity < 0) {
        return "Stock quantity must be a non-negative whole number.";
    }

    if (
        !Number.isInteger(data.lowStockThreshold) ||
        data.lowStockThreshold < 0
    ) {
        return "Low stock threshold must be a non-negative whole number.";
    }

    if (data.sku && data.sku.length > 80) {
        return "SKU cannot exceed 80 characters.";
    }

    if (data.barcode && data.barcode.length > 80) {
        return "Barcode cannot exceed 80 characters.";
    }

    if (data.category && data.category.length > 100) {
        return "Category cannot exceed 100 characters.";
    }

    if (data.unit.length > 30) {
        return "Unit cannot exceed 30 characters.";
    }

    if (
        data.imageKey &&
        (
            data.imageKey.length > 500 ||
            !data.imageKey.startsWith("businesses/")
        )
    ) {
        return "Invalid product image.";
    }

    if (data.imageUrl && data.imageUrl.length > 2000) {
        return "Product image URL is too long.";
    }

    return null;
}

const productFields = `
    id,
    name,
    buying_price,
    selling_price,
    stock_quantity,
    low_stock_threshold,
    sku,
    barcode,
    category,
    unit,
    image_key,
    image_url,
    created_at,
    updated_at
`;

async function getProducts(req, res) {
    const businessId = businessIdFrom(req);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    try {
        const result = await pool.query(
            `
            SELECT ${productFields}
            FROM products
            WHERE business_id = $1
            ORDER BY id DESC
            `,
            [businessId]
        );

        return res.json({
            products: result.rows
        });
    } catch (error) {
        console.error("GET PRODUCTS ERROR:", error);

        return res.status(500).json({
            message: "Failed to fetch products."
        });
    }
}

async function getProductById(req, res) {
    const businessId = businessIdFrom(req);
    const productId = validateProductId(req.params.id);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    if (!productId) {
        return res.status(400).json({
            message: "Invalid product ID."
        });
    }

    try {
        const result = await pool.query(
            `
            SELECT ${productFields}
            FROM products
            WHERE id = $1
              AND business_id = $2
            `,
            [productId, businessId]
        );

        if (!result.rowCount) {
            return res.status(404).json({
                message: "Product not found."
            });
        }

        return res.json({
            product: result.rows[0]
        });
    } catch (error) {
        console.error("GET PRODUCT ERROR:", error);

        return res.status(500).json({
            message: "Failed to fetch product."
        });
    }
}

async function createProduct(req, res) {
    const businessId = businessIdFrom(req);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    const data = input(req.body);
    const validationError = validateProductInput(data);

    if (validationError) {
        return res.status(400).json({
            message: validationError
        });
    }

    const client = await pool.connect();
    let begun = false;

    try {
        await client.query("BEGIN");
        begun = true;

        const result = await client.query(
            `
            INSERT INTO products (
                business_id,
                name,
                buying_price,
                selling_price,
                stock_quantity,
                low_stock_threshold,
                sku,
                barcode,
                category,
                unit,
                image_key,
                image_url
            )
            VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
            )
            RETURNING ${productFields}
            `,
            [
                businessId,
                data.name,
                data.buyingPrice,
                data.sellingPrice,
                data.stockQuantity,
                data.lowStockThreshold,
                data.sku,
                data.barcode,
                data.category,
                data.unit,
                data.imageKey,
                data.imageUrl
            ]
        );

        const product = result.rows[0];

        if (data.stockQuantity > 0) {
            await client.query(
                `
                INSERT INTO stock_movements (
                    business_id,
                    product_id,
                    movement_type,
                    quantity_change,
                    notes,
                    created_by
                )
                VALUES (
                    $1,
                    $2,
                    'opening',
                    $3,
                    $4,
                    $5
                )
                `,
                [
                    businessId,
                    product.id,
                    data.stockQuantity,
                    "Opening stock",
                    req.user.id
                ]
            );
        }

        await client.query("COMMIT");
        begun = false;

        await logAudit(
            req,
            "product.created",
            "product",
            product.id,
            {
                name: product.name
            }
        );

        await notifyLowStock(
            businessId,
            product,
            req.user.id
        );

        return res.status(201).json({
            message: "Product created successfully.",
            product
        });
    } catch (error) {
        if (begun) {
            try {
                await client.query("ROLLBACK");
            } catch {}
        }

        if (error.code === "23505") {
            return res.status(409).json({
                message:
                    "That SKU or barcode is already used in this business."
            });
        }

        console.error("CREATE PRODUCT ERROR:", error);

        return res.status(500).json({
            message: "Failed to create product."
        });
    } finally {
        client.release();
    }
}

async function updateProduct(req, res) {
    const businessId = businessIdFrom(req);
    const productId = validateProductId(req.params.id);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    if (!productId) {
        return res.status(400).json({
            message: "Invalid product ID."
        });
    }

    const data = input(req.body);
    const validationError = validateProductInput(data);

    if (validationError) {
        return res.status(400).json({
            message: validationError
        });
    }

    const client = await pool.connect();
    let begun = false;

    try {
        await client.query("BEGIN");
        begun = true;

        const current = await client.query(
            `
            SELECT
                id,
                name,
                stock_quantity
            FROM products
            WHERE id = $1
              AND business_id = $2
            FOR UPDATE
            `,
            [productId, businessId]
        );

        if (!current.rowCount) {
            const error = new Error("Product not found.");
            error.status = 404;
            throw error;
        }

        const oldStock = Number(current.rows[0].stock_quantity);

        const result = await client.query(
            `
            UPDATE products
            SET
                name = $1,
                buying_price = $2,
                selling_price = $3,
                stock_quantity = $4,
                low_stock_threshold = $5,
                sku = $6,
                barcode = $7,
                category = $8,
                unit = $9,
                image_key = $10,
                image_url = $11,
                updated_at = NOW()
            WHERE id = $12
              AND business_id = $13
            RETURNING ${productFields}
            `,
            [
                data.name,
                data.buyingPrice,
                data.sellingPrice,
                data.stockQuantity,
                data.lowStockThreshold,
                data.sku,
                data.barcode,
                data.category,
                data.unit,
                data.imageKey,
                data.imageUrl,
                productId,
                businessId
            ]
        );

        const difference = data.stockQuantity - oldStock;

        if (difference !== 0) {
            await client.query(
                `
                INSERT INTO stock_movements (
                    business_id,
                    product_id,
                    movement_type,
                    quantity_change,
                    notes,
                    created_by
                )
                VALUES (
                    $1,
                    $2,
                    'adjustment',
                    $3,
                    $4,
                    $5
                )
                `,
                [
                    businessId,
                    productId,
                    difference,
                    "Stock changed from product edit",
                    req.user.id
                ]
            );
        }

        await client.query("COMMIT");
        begun = false;

        const product = result.rows[0];

        await logAudit(
            req,
            "product.updated",
            "product",
            productId,
            {
                stockDifference: difference
            }
        );

        await notifyLowStock(
            businessId,
            product,
            req.user.id
        );

        return res.json({
            message: "Product updated successfully.",
            product
        });
    } catch (error) {
        if (begun) {
            try {
                await client.query("ROLLBACK");
            } catch {}
        }

        if (error.code === "23505") {
            return res.status(409).json({
                message:
                    "That SKU or barcode is already used in this business."
            });
        }

        console.error("UPDATE PRODUCT ERROR:", error);

        return res.status(error.status || 500).json({
            message: error.message || "Failed to update product."
        });
    } finally {
        client.release();
    }
}

async function deleteProduct(req, res) {
    const businessId = businessIdFrom(req);
    const productId = validateProductId(req.params.id);

    if (!businessId) {
        return res.status(401).json({
            message: "Business context is missing."
        });
    }

    if (!productId) {
        return res.status(400).json({
            message: "Invalid product ID."
        });
    }

    try {
        const result = await pool.query(
            `
            DELETE FROM products
            WHERE id = $1
              AND business_id = $2
            RETURNING id, name
            `,
            [productId, businessId]
        );

        if (!result.rowCount) {
            return res.status(404).json({
                message: "Product not found."
            });
        }

        await logAudit(
            req,
            "product.deleted",
            "product",
            productId,
            {
                name: result.rows[0].name
            }
        );

        return res.json({
            message: "Product deleted successfully.",
            product: result.rows[0]
        });
    } catch (error) {
        if (error.code === "23503") {
            return res.status(409).json({
                message:
                    "This product cannot be deleted because it is referenced by sales, purchases, or stock history."
            });
        }

        console.error("DELETE PRODUCT ERROR:", error);

        return res.status(500).json({
            message: "Failed to delete product."
        });
    }
}

module.exports = {
    getProducts,
    getProductById,
    createProduct,
    updateProduct,
    deleteProduct
};