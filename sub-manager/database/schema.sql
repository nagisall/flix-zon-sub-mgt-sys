-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom ENUM types
CREATE TYPE user_role AS ENUM ('admin', 'staff', 'customer');
CREATE TYPE billing_frequency AS ENUM ('daily', 'weekly', 'monthly', 'yearly');
CREATE TYPE subscription_status AS ENUM ('Draft', 'Quotation', 'Confirmed', 'Active', 'Closed');
CREATE TYPE invoice_status AS ENUM ('Draft', 'Confirmed', 'Paid');
CREATE TYPE discount_type AS ENUM ('fixed', 'percentage');

-- 1. Users / Accounts
CREATE TABLE users 
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'customer',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. Products & Variants
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    sales_price NUMERIC(12, 2) NOT NULL CHECK (sales_price >= 0),
    cost_price NUMERIC(12, 2) NOT NULL CHECK (cost_price >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE product_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name VARCHAR(255) NOT NULL,
    price_modifier NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    cost_modifier NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. Plans
CREATE TABLE plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    frequency billing_frequency NOT NULL,
    minimum_quantity INT NOT NULL DEFAULT 1 CHECK (minimum_quantity > 0),
    start_date DATE NOT NULL,
    end_date DATE,
    auto_close BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_plan_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

-- 4. Discounts
CREATE TABLE discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE,
    type discount_type NOT NULL,
    value NUMERIC(10, 2) NOT NULL CHECK (value > 0),
    min_purchase_amount NUMERIC(12, 2) DEFAULT 0.00 CHECK (min_purchase_amount >= 0),
    min_quantity INT DEFAULT 1 CHECK (min_quantity >= 1),
    usage_limit INT CHECK (usage_limit IS NULL OR usage_limit > 0),
    times_used INT NOT NULL DEFAULT 0 CHECK (times_used >= 0),
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ,
    CONSTRAINT check_discount_validity CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

-- 5. Quotations & Subscriptions
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE RESTRICT,
    status subscription_status NOT NULL DEFAULT 'Draft',
    payment_terms VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT check_sub_dates CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE subscription_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES product_variants(id) ON DELETE SET NULL,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0)
);

-- 6. Invoices & Payments
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE RESTRICT,
    status invoice_status NOT NULL DEFAULT 'Draft',
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    tax_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    discount_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    total_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    due_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
    tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00 CHECK (tax_rate >= 0),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0)
);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    payment_method VARCHAR(50) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    payment_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    notes TEXT
);

-- Performance Indexes on frequent query paths
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_subscriptions_customer ON subscriptions(customer_id);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);