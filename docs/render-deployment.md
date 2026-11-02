# Deploying Campus Facility Management System on Render

This guide walks you through deploying the Campus Facility Management System on [Render](https://render.com/).

---

## Prerequisites

1. A [Render account](https://dashboard.render.com/).
2. Your project repository pushed to GitHub or GitLab.

---

## Deployment Methods

You can deploy using either **Option A (Render Blueprint - Recommended)** or **Option B (Manual Dashboard Setup)**.

---

### Option A: 1-Click Blueprint Deployment (Recommended)

The repository includes a ready-to-use [`render.yaml`](../render.yaml) blueprint that automatically provisions both the Web Service and a PostgreSQL database.

1. Go to the [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** > **Blueprint**.
3. Connect your GitHub/GitLab repository.
4. Render will detect the `render.yaml` file:
    - **Web Service**: `campus-facility-management` (Node.js runtime)
    - **PostgreSQL Database**: `campus-facility-db`
    - **Environment Variables**: Automatically links `DATABASE_URL` and generates a secure `JWT_SECRET`.
5. Click **Apply**.
6. Render will build the project and deploy the database and web service.

---

### Option B: Manual Setup via Render Dashboard

If you prefer to configure services manually or connect an existing PostgreSQL database:

#### 1. Create the PostgreSQL Database

1. In Render Dashboard, click **New +** > **PostgreSQL**.
2. Set a name (e.g., `campus-facility-db`).
3. Database: `campus_facility_db`, User: `campus_admin`.
4. Choose the **Free** instance type.
5. Click **Create Database**.
6. Once provisioned, copy the **Internal Database URL** (or External URL if deploying from outside Render).

#### 2. Create the Web Service

1. Click **New +** > **Web Service**.
2. Connect your repository.
3. Configure the settings:
    - **Name**: `campus-facility-management`
    - **Region**: Same region as your database
    - **Runtime**: `Node`
    - **Build Command**:
        ```sh
        npm install && npm run build
        ```
    - **Start Command**:
        ```sh
        npm start
        ```
    - **Plan**: `Free`

#### 3. Add Environment Variables

Under the **Environment Variables** tab for your web service, add:

| Key                          | Value / Description                                         |
| :--------------------------- | :---------------------------------------------------------- |
| `NODE_VERSION`               | `24.0.0` (Ensures Node.js 24 is used)                       |
| `NODE_ENV`                   | `production`                                                |
| `DATABASE_URL`               | Your PostgreSQL connection string (from Step 1)             |
| `JWT_SECRET`                 | A secure 64-character random hex string (at least 32 bytes) |
| `PROVISION_ADMIN_EMAIL`      | e.g. `admin@campus.edu` (Optional, for seeding)             |
| `PROVISION_ADMIN_PASSWORD`   | Password (min 15 chars, max 72 bytes)                       |
| `PROVISION_ADMIN_FIRST_NAME` | `System`                                                    |
| `PROVISION_ADMIN_LAST_NAME`  | `Administrator`                                             |

> [!TIP]
> Generate a secure `JWT_SECRET` locally by running:
>
> ```sh
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

4. Click **Deploy Web Service**.

---

## Database Initialization & Seeding

After your service and database are up, initialize the database schema and populate lookups/admin account:

### Using the Render Shell

1. In your Web Service dashboard, go to the **Shell** tab.
2. Push the schema to the database:
    ```sh
    npm run prisma:push
    ```
3. Seed the initial roles, statuses, facility types, categories, and admin user:
    ```sh
    npm run db:seed
    ```
4. Verify the connection:
    ```sh
    npm run db:check
    ```

> [!WARNING]
> These commands do **not** install the reservation workflow. `prisma db push`
> synchronizes Prisma-managed schema only; it does not execute SQL migrations.
> `POST /api/reservations` calls `im101_private.create_reservation`, which is
> defined in `20261026020000_reservation_create`. If that procedure is absent,
> reservation submissions fail with HTTP 500. The reservation migrations are
> currently provisional/offline artifacts and require dedicated PostgreSQL role
> provisioning, operator review, and separate authorization before deployment.
> Do not run `prisma migrate deploy` against a hosted database as a workaround.
> See [the reservation workflow](./reservation-workflow.md) and
> [release readiness](./application-release-readiness.md) for the deployment gates.

---

## Verifying Deployment

1. **Health Check**: Open `https://<your-render-url>.onrender.com/api/health` in your browser. It should return:
    ```json
    { "success": true, "message": "Campus Facility Management API is running." }
    ```
2. **Web Application**: Navigate to `https://<your-render-url>.onrender.com/`. You will see the campus facility login screen.
3. **Login**: Sign in with your configured administrator credentials (`admin@campus.edu`).
