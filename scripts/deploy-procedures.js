const dns = require("node:dns");
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");
require("dotenv").config({ quiet: true });

async function deployProcedures() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error("DATABASE_URL is not set.");
    }

    const sqlPath = path.join(__dirname, "deploy-procedures.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");

    // Connect with pg client to execute multi-statement DDL cleanly
    const isLocal =
        connectionString.includes("localhost") ||
        connectionString.includes("127.0.0.1");
    let ssl = undefined;
    if (
        !isLocal &&
        (connectionString.includes("sslmode=require") ||
            connectionString.includes("render.com") ||
            connectionString.includes("supabase.co"))
    ) {
        ssl = { rejectUnauthorized: false };
    }

    const client = new Client({
        connectionString,
        ssl,
    });

    try {
        await client.connect();
        console.log(
            "Applying im101_private schema, stored procedures, and triggers...",
        );
        await client.query(sql);
        console.log(
            "✓ Successfully deployed im101_private stored procedures and triggers.",
        );
    } finally {
        await client.end().catch(() => {});
    }
}

if (require.main === module) {
    deployProcedures().catch((err) => {
        console.error("Failed to deploy procedures:", err);
        process.exitCode = 1;
    });
}

module.exports = { deployProcedures };
