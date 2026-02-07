# Database Schema Analysis

## 1. Executive Summary

The database design for **AIsell** is a modern, **Multi-Tenant SaaS** schema built on **PostgreSQL**. It correctly isolates tenant data while allowing for scalable application growth. The schema makes extensive use of **JSONB** for flexibility (system configurations, product attributes) and includes dedicated structures for the project's unique value propositions: AI integration and Content Marketing.

## 2. Structural Analysis

### 2.1 Multi-Tenancy Strategy
*   **Strategy**: Row-Level Isolation (Shared Database, Shared Schema).
*   **Implementation**: Every major table (`products`, `orders`, `users`) includes a `tenant_id` foreign key.
*   **Assessment**: This is the most cost-effective and manageable approach for a startup/growth-phase SaaS. It avoids the operational overhead of "Database-per-tenant" while maintaining better data density.
*   **Security**: Relies on application-level middleware (or RLS) to enforce `tenant_id` filtering. This is critical to prevent data leakage.

### 2.2 Core Domains

#### Identity & Access Management (IAM)
*   **Tenant vs. Shop**: The separation of `tenants` (billing entity) and `shops` (storefronts) is a mature design choice. It allows a single business owner to manage multiple brands or localized stores under one subscription.
*   **User Roles**: `user_tenants` allows a many-to-many relationship, enabling an "Agency" model where one user can be a staff member in multiple different tenants.

#### Product Catalog (E-commerce)
*   **Hybrid Data Model**:
    *   Structured data for core fields (`price`, `sku`, `stock`).
    *   Unstructured data (JSONB) for `product_variants.attributes` (e.g., `{"color": "red", "size": "M"}`). This avoids the complex EAV (Entity-Attribute-Value) pattern often found in older systems like Magento, resulting in faster queries.
*   **AI Readiness**: Explicit fields like `description_md` (Markdown) and `description_html` streamline the AI generation workflow defined in the PRD.

#### Order Processing
*   **Snapshotting**: `order_items` stores a copy of `name`, `sku`, and `unit_price` at the time of purchase. This is a crucial best practice to prevent historical order data directly referencing changed product prices.
*   **Decoupled Payments**: Separating `orders` from `payments` (1:N relationship) allows for failed payment retries and partial refunds without complicating the order status logic.

#### SaaS Billing & Usage
*   **Native Metering**: `tenant_usage_metrics` and `tenant_api_limits` tables are built-in. This enables defining "Seed/Growth/Pro" plans based on actual usage (AI tokens, storage), which is essential for the AI-driven business model.

#### Universal Commerce Protocol (UCP)
*   **Agentic Commerce**: The `ucp_checkout_sessions` table supports the "Universal Commerce Protocol," allowing AI agents (like Google's) to discover products and negotiate checkout directly.
*   **Platform Agnostic**: Fields like `platformId` and `paymentHandlers` (JSON) enable interoperability with various AI buying agents without changing the core order logic.

#### File Management
*   **Unified Storage**: The `files` table uses a polymorphic design (`entityType` + `entityId`) to attach files to any resource (Products, Blogs, Orders).
*   **Hybrid Storage**: Supports both database storage (`data` column for small files) and external blob storage (`blobUrl` for S3/R2), controlled by `SystemSettings`.

## 3. Key Strengths
1.  **Flexibility**: Extensive use of `JSONB` in `config` columns (shops, payment_providers) allows adding new third-party integrations (e.g., a new logistics provider) without schema migrations.
2.  **AI Attribution**: The `ai_attributions` table directly links AI interactions to Orders for revenue calculation. This is vital for the "Cost Per Sale" (CPS) commission model mentioned in the PRD.
3.  **SEO/AEO Optimization**: The `blog_posts` table includes dedicated fields for JSON-LD (`seo_json`) and OpenGraph, directly supporting the "Traffic Secrets" and "AEO" marketing goals.

## 4. Recommendations & Potential Gaps

### 4.1 Concurrency Control
*   **Observation**: `stock` is an integer field.
*   **Risk**: Race conditions during flash sales.
*   **Recommendation**: Implement **Optimistic Locking** (using a version column) or ensure atomic updates (`UPDATE products SET stock = stock - 1 WHERE id = ? AND stock > 0`) at the repository layer.

### 4.2 Promotion System
*   **Observation**: `orders` has a `discount_amount` field, but there is no dedicated schema for **Coupons** or **Promotion Rules** (e.g., "Buy X get Y free").
*   **Recommendation**: In the next iteration, introduce `promotions` and `coupons` tables to standardize how discounts are calculated and tracked.

### 4.3 Internationalization (i18n)
*   **Observation**: `products` table has single columns for `name`, `description`.
*   **Gap**: If a shop needs to sell globally (Phase 3), it may need multiple translations for a single product.
*   **Recommendation**: For the "International Stage", plan to migrate translatable fields to a `jsonb` format (e.g., `name: {"en": "Shirt", "zh": "襯衫"}`) or a separate translation table.

### 4.4 Audit Logging
*   **Observation**: `audit_logs` table exists.
*   **Recommendation**: Ensure this table is partitioned by time (e.g., monthly) as it will grow very rapidly. Consider moving older logs to cold storage (S3/R2) to save DB costs.
