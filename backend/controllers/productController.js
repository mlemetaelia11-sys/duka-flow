const pool = require("../db");

async function getProducts(request, response) {
    try {
        const result = await pool.query(`
            SELECT
                id,
                name,
                buying_price,
                selling_price,
                stock_quantity,
                low_stock_threshold,
                created_at,
                updated_at
            FROM products
            ORDER BY id DESC
        `);

        response.json({
            products: result.rows
        });
    } catch (error) {
        console.error("Failed to fetch products:", error);

        response.status(500).json({
            message: "Failed to fetch products."
        });
    }
}


async function createProduct(request, response) {
    try {
        const {
            name,
            buyingPrice,
            sellingPrice,
            stockQuantity,
            lowStockThreshold
        } = request.body;

        const cleanName = typeof name === "string"
            ? name.trim()
            : "";

        const buyingPriceValue = Number(buyingPrice);
        const sellingPriceValue = Number(sellingPrice);
        const stockQuantityValue = Number(stockQuantity);

        const lowStockThresholdValue =
            lowStockThreshold === undefined
                ? 5
                : Number(lowStockThreshold);

        if (cleanName.length < 2 || cleanName.length > 150) {
            return response.status(400).json({
                message:
                    "Product name must contain between 2 and 150 characters."
            });
        }

        if (
            !Number.isFinite(buyingPriceValue) ||
            buyingPriceValue < 0
        ) {
            return response.status(400).json({
                message: "Buying price must be 0 or greater."
            });
        }

        if (
            !Number.isFinite(sellingPriceValue) ||
            sellingPriceValue < 0
        ) {
            return response.status(400).json({
                message: "Selling price must be 0 or greater."
            });
        }

        if (
            !Number.isInteger(stockQuantityValue) ||
            stockQuantityValue < 0
        ) {
            return response.status(400).json({
                message:
                    "Stock quantity must be a whole number of 0 or greater."
            });
        }

        if (
            !Number.isInteger(lowStockThresholdValue) ||
            lowStockThresholdValue < 0
        ) {
            return response.status(400).json({
                message:
                    "Low-stock threshold must be a whole number of 0 or greater."
            });
        }

        const result = await pool.query(
            `
            INSERT INTO products (
                name,
                buying_price,
                selling_price,
                stock_quantity,
                low_stock_threshold
            )
            VALUES ($1, $2, $3, $4, $5)
            RETURNING
                id,
                name,
                buying_price,
                selling_price,
                stock_quantity,
                low_stock_threshold,
                created_at,
                updated_at
            `,
            [
                cleanName,
                buyingPriceValue,
                sellingPriceValue,
                stockQuantityValue,
                lowStockThresholdValue
            ]
        );

        response.status(201).json({
            message: "Product created successfully.",
            product: result.rows[0]
        });
    } catch (error) {
        console.error("Failed to create product:", error);

        response.status(500).json({
            message: "Failed to create product."
        });
    }
}


async function updateProduct(request, response) {
    try {
        const productId = Number(request.params.id);

        if (!Number.isInteger(productId) || productId <= 0) {
            return response.status(400).json({
                message: "Product ID must be a positive integer."
            });
        }

        const {
            name,
            buyingPrice,
            sellingPrice,
            stockQuantity,
            lowStockThreshold
        } = request.body;

        const cleanName = typeof name === "string"
            ? name.trim()
            : "";

        const buyingPriceValue = Number(buyingPrice);
        const sellingPriceValue = Number(sellingPrice);
        const stockQuantityValue = Number(stockQuantity);

        const lowStockThresholdValue =
            lowStockThreshold === undefined
                ? 5
                : Number(lowStockThreshold);

        if (cleanName.length < 2 || cleanName.length > 150) {
            return response.status(400).json({
                message:
                    "Product name must contain between 2 and 150 characters."
            });
        }

        if (
            !Number.isFinite(buyingPriceValue) ||
            buyingPriceValue < 0
        ) {
            return response.status(400).json({
                message: "Buying price must be 0 or greater."
            });
        }

        if (
            !Number.isFinite(sellingPriceValue) ||
            sellingPriceValue < 0
        ) {
            return response.status(400).json({
                message: "Selling price must be 0 or greater."
            });
        }

        if (
            !Number.isInteger(stockQuantityValue) ||
            stockQuantityValue < 0
        ) {
            return response.status(400).json({
                message:
                    "Stock quantity must be a whole number of 0 or greater."
            });
        }

        if (
            !Number.isInteger(lowStockThresholdValue) ||
            lowStockThresholdValue < 0
        ) {
            return response.status(400).json({
                message:
                    "Low-stock threshold must be a whole number of 0 or greater."
            });
        }

        const result = await pool.query(
            `
            UPDATE products
            SET
                name = $1,
                buying_price = $2,
                selling_price = $3,
                stock_quantity = $4,
                low_stock_threshold = $5,
                updated_at = NOW()
            WHERE id = $6
            RETURNING
                id,
                name,
                buying_price,
                selling_price,
                stock_quantity,
                low_stock_threshold,
                created_at,
                updated_at
            `,
            [
                cleanName,
                buyingPriceValue,
                sellingPriceValue,
                stockQuantityValue,
                lowStockThresholdValue,
                productId
            ]
        );

        if (result.rows.length === 0) {
            return response.status(404).json({
                message: "Product not found."
            });
        }

        response.json({
            message: "Product updated successfully.",
            product: result.rows[0]
        });
    } catch (error) {
        console.error("Failed to update product:", error);

        response.status(500).json({
            message: "Failed to update product."
        });
    }
}


async function deleteProduct(request, response) {
    try {
        const productId = Number(request.params.id);

        if (!Number.isInteger(productId) || productId <= 0) {
            return response.status(400).json({
                message: "Product ID must be a positive integer."
            });
        }

        const result = await pool.query(
            `
            DELETE FROM products
            WHERE id = $1
            RETURNING
                id,
                name
            `,
            [productId]
        );

        if (result.rows.length === 0) {
            return response.status(404).json({
                message: "Product not found."
            });
        }

        response.json({
            message: "Product deleted successfully.",
            product: result.rows[0]
        });
    } catch (error) {
        console.error("Failed to delete product:", error);

        response.status(500).json({
            message: "Failed to delete product."
        });
    }
}


module.exports = {
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct
};