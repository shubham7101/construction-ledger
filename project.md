# Construction Ledger - Project Specification

## 1. Overview & Vision
**Construction Ledger** is a mobile-first, Khata Book-style web application designed specifically for construction businesses, real estate developers, contractors, and site managers. 

In construction management, a single business operates across multiple active construction sites. Contractors, vendors, daily wage teams, and material suppliers frequently work across multiple sites simultaneously, while each site involves multiple contractors.

This application provides a simple, fast, and reliable mobile-first platform to log financial transactions, track contractor ledgers, monitor site expenses, and maintain strict access controls across administrative and field staff.

---

## 2. Core Technical Architecture & Database Strategy

### Technology Stack
- **Frontend & Server**: Next.js (App Router), React 19, TypeScript, TailwindCSS v4.
- **Database Engine**: LibSQL / SQLite dialect.
  - **Local Development**: Embedded SQLite3 database file (`file:local.db` or `@libsql/client`).
  - **Production / Staging**: Turso DB (Distributed serverless LibSQL cloud database).
- **Authentication**: JWT (JSON Web Token) authentication using primary mobile number (`phone_number_1`) and hashed passwords.
- **UI Design System**: Mobile-first responsive Khata Book layout, bottom navigation bar, touch-optimized forms, dark/light theme support.

---

## 3. Database Schema & Data Models

### 3.1 Entity Relationship Diagram (Conceptual)
```
[person_type] 1 --- * [person] 1 --- * [users]
                        |                |
                        |                *
                        |          [site_access]
                        *                |
                [site_membership]        |
                        |                |
                        *                *
                     [site] <------------+
                     |    |
          +----------+    +----------+
          |                          |
          *                          *
      [ledger]                   [expense]
          |                          |
          +----------+---------------+
                     |
                     *
                [category]
```

---

### 3.2 SQL Table Definitions (LibSQL / SQLite)

#### `person_type`
Defines the role/type of an entity (e.g., Contractor, Vendor, Client, Material Supplier, Daily Wage Worker, Subcontractor).
```sql
CREATE TABLE person_type (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, -- e.g., 'Contractor', 'Vendor', 'Client', 'Supplier', 'Laborer'
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `person`
Stores all individuals and corporate entities interacting with the construction business.
```sql
CREATE TABLE person (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone_number_1 TEXT NOT NULL UNIQUE, -- Used as primary login mobile for users
    phone_number_2 TEXT,
    email TEXT,
    type_of_person_id INTEGER NOT NULL,
    company_name TEXT,
    address TEXT,
    is_active BOOLEAN DEFAULT 1, -- Soft deletion flag (1 = active, 0 = deleted/inactive)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (type_of_person_id) REFERENCES person_type(id) ON DELETE RESTRICT
);
```

#### `users`
System user credentials mapped 1-to-1 with a `person` record.
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person_id INTEGER NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'regular')) DEFAULT 'regular',
    is_active BOOLEAN DEFAULT 1,
    last_login_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE
);
```

#### `site`
Construction project sites owned or managed by the business.
```sql
CREATE TABLE site (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    city TEXT,
    state TEXT,
    status TEXT CHECK(status IN ('active', 'completed', 'on_hold')) DEFAULT 'active',
    is_active BOOLEAN DEFAULT 1, -- Soft deletion flag (1 = active, 0 = deleted/inactive)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `site_membership`
Maps contractors/vendors (`person`) to specific construction `site`s. A contractor can belong to multiple sites, and a site can have multiple contractors.
```sql
CREATE TABLE site_membership (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    person_id INTEGER NOT NULL,
    role_at_site TEXT, -- e.g., 'Civil Contractor', 'Electrical Vendor'
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT CHECK(status IN ('active', 'inactive')) DEFAULT 'active',
    FOREIGN KEY (site_id) REFERENCES site(id) ON DELETE CASCADE,
    FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE,
    UNIQUE(site_id, person_id)
);
```

#### `site_access`
Determines which system `users` can view and manage transactions for a specific `site`. (Managed by Admin users).
```sql
CREATE TABLE site_access (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    granted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES site(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(site_id, user_id)
);
```

#### `category`
Categorization master for ledgers and expense items.
```sql
CREATE TABLE category (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, -- e.g., 'Cement', 'Steel', 'Labor Wage', 'Machinery Hire', 'Plumbing', 'Electrical', 'Transport'
    type TEXT CHECK(type IN ('ledger', 'expense', 'both')) DEFAULT 'both',
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### `ledger`
Tracks financial transfers between parties (`from_person` and `to_person`) associated with a site.
```sql
CREATE TABLE ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_person_id INTEGER NOT NULL,
    to_person_id INTEGER NOT NULL,
    site_id INTEGER, -- Optional, as some corporate transfers are cross-site or central
    amount REAL NOT NULL CHECK(amount > 0),
    type_of_payment TEXT CHECK(type_of_payment IN ('give', 'got', 'debit', 'credit')) NOT NULL,
    payment_mode TEXT CHECK(payment_mode IN ('cash', 'upi', 'bank_transfer', 'cheque', 'other')) DEFAULT 'cash',
    category_id INTEGER NOT NULL, -- Mandatory category for auditing & reporting
    note TEXT,
    receipt_url TEXT,
    logged_by INTEGER NOT NULL, -- user_id of creator
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (from_person_id) REFERENCES person(id) ON DELETE RESTRICT,
    FOREIGN KEY (to_person_id) REFERENCES person(id) ON DELETE RESTRICT,
    FOREIGN KEY (site_id) REFERENCES site(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE RESTRICT,
    FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE RESTRICT
);
```

#### `expense`
Tracks site operational overheads and direct expenses logged by authorized users.
```sql
CREATE TABLE expense (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    category_id INTEGER NOT NULL,
    payment_mode TEXT CHECK(payment_mode IN ('cash', 'upi', 'bank_transfer', 'cheque', 'petty_cash')) DEFAULT 'cash',
    vendor_person_id INTEGER, -- Optional link to a vendor person
    note TEXT,
    receipt_url TEXT,
    logged_by INTEGER NOT NULL, -- user_id of creator
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (site_id) REFERENCES site(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES category(id) ON DELETE RESTRICT,
    FOREIGN KEY (vendor_person_id) REFERENCES person(id) ON DELETE SET NULL,
    FOREIGN KEY (logged_by) REFERENCES users(id) ON DELETE RESTRICT
);
```

---

## 4. User Roles & Access Control Policy

### 4.1 Admin Users (`role = 'admin'`)
- **User Management**: Create, edit, activate/deactivate users, reset passwords.
- **Site Management**: Add new construction sites, edit site details, mark sites as completed.
- **Access Control (`site_access`)**: Assign or revoke user permissions to individual construction sites.
- **Master Data**: Manage `category` list and `person_type` list.
- **Global Financial Visibility**: Full access to all sites, ledgers, expenses, and system reports.

### 4.2 Regular Users (`role = 'regular'`)
- **Login**: Login using primary phone number (`phone_number_1`) and password.
- **Site Access Restriction**: Access is strictly limited to sites assigned to the user in `site_access`.
- **Site Operations**:
  - View contractors (`site_membership`) linked to accessible sites.
  - Log ledger transactions (`give` / `got`) for accessible sites.
  - Record site operational expenses for accessible sites.
  - View Person Ledgers, Site Ledgers, and Category Reports for accessible sites.

---

## 5. Core Views (Must-Have Screens)

### 5.1 Person Ledger View (`/ledgers/person/[personId]`)
- **Scope Options**:
  - **All Sites View**: Aggregates all transactions for the selected person across all accessible sites.
  - **Per-Site Filter**: Filters transactions specifically for a chosen site (e.g. Site A vs Site B).
- **UI Elements**:
  - **Header Card**: Displays Person Name, Phone Number, Role Badge, and Net Balance Summary (**"You Give: ₹X"** or **"You Get: ₹Y"**).
  - **Passbook Stream**: Chronological list of `give` (payment debit) and `got` (payment credit) entries.
  - **Quick Action Bar**: Sticky mobile bottom action buttons: `+ Give (Debit)` (Red button) and `+ Got (Credit)` (Green button).
  - **Sharing & PDF**: One-tap export to PDF and WhatsApp share button for sending statements directly to contractors.

### 5.2 Site Ledger View (`/sites/[siteId]/ledger`)
- **Overview**: Single unified dashboard for a specific construction site.
- **UI Elements**:
  - **Site Overview Card**: Site Name, Address, Active Contractors Count, Net Spent, Inflow vs Outflow.
  - **Contractor Roll-Up Table**: List of contractors on site with their current net balances.
  - **Combined Ledger & Expense Stream**: Chronological feed containing both site ledger payments and direct site operational expenses.
  - **Search & Filters**: Filter by Date Range, Transaction Type (Ledger vs Expense), Category, and Contractor.

### 5.3 Category View (`/categories` & `/sites/[siteId]/categories`)
- **Scope Options**:
  - **All Sites View**: Total spending breakdown across all sites grouped by operational categories (e.g., Cement, Steel, Wage/Labor, Machinery Hire).
  - **Per-Site View**: Category breakdown for a single selected construction site.
- **UI Elements**:
  - **Visual Spending Bars / Pie Charts**: Percentage distribution of spending across categories.
  - **Category Drill-Down**: Clicking a category reveals all underlying expense entries and ledger items tagged with that category.
  - **Budget Comparison** (Optional future extension): Visual indicator of category spending against allocated budget limit.

---

## 6. Financial Calculation & Sign Conventions

Following established ledger conventions:
- **Payment Given / Debit (`give`)**: Logged when money or materials are provided to a contractor/vendor. Increases receivables (`+`).
- **Payment Received / Credit (`got`)**: Logged when money is received or credited. Deducts from running balance (`-`).
- **Running Balance Display**: Net balance is displayed cleanly without positive sign prefixes (e.g., `₹15,000 Receivable` or `₹5,200 Payable`).

---

## 7. Database Migration & Environment Setup

### Environment Variables (`.env.local` / `.env.production`)
```bash
# Local Development (SQLite3)
DATABASE_URL="file:local.db"
DATABASE_AUTH_TOKEN=""

# Production / Staging (Turso DB Cloud)
# DATABASE_URL="libsql://your-database-name-your-org.turso.io"
# DATABASE_AUTH_TOKEN="your-turso-auth-token"

# JWT Authentication Secret
JWT_SECRET="your-super-secret-jwt-key"
```

---

## 8. Mobile-First UX Principles

1. **Khata Book Style Usability**:
   - High-contrast visual cues for payments given vs received.
   - Large touch targets for fast typing on mobile touchscreens.
2. **Offline Resilience & PWA Support**:
   - Progressive Web App manifest for desktop and mobile home screen installation.
3. **Responsive Navigation**:
   - Sticky bottom tab bar for mobile devices (`Sites`, `Contractors`, `Expenses`, `Categories`, `Admin`).
