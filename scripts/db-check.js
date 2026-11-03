const dns = require("node:dns");
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");

function reportError(error) {
    const codes = new Set();
    const seen = new Set();
    const messages = [];
    function inspect(value, depth = 0) {
        if (!value || typeof value !== "object" || seen.has(value) || depth > 8)
            return;
        seen.add(value);
        for (const key of ["code", "originalCode"]) {
            // Only symbolic driver/Prisma codes, never arbitrary error text.
            if (
                typeof value[key] === "string" &&
                /^[A-Z0-9_]{2,64}$/.test(value[key])
            ) {
                codes.add(value[key]);
            }
        }
        for (const key of ["message", "originalMessage"]) {
            if (typeof value[key] === "string") messages.push(value[key]);
        }
        for (const key of ["cause", "meta", "driverAdapterError"])
            inspect(value[key], depth + 1);
        if (Array.isArray(value.errors))
            value.errors.forEach((item) => inspect(item, depth + 1));
    }
    inspect(error);
    const details = [...codes, ...messages].join(" ");
    let category = "configuration";
    if (/CERT|TLS|SSL|self.signed|certificate/i.test(details))
        category = "SSL/TLS";
    else if (
        /28P01|28000|P1000|authentication|password authentication/i.test(
            details,
        )
    )
        category = "authentication";
    else if (
        /TIMEOUT|TIMEDOUT|P1002|P1008|P2024|timeout|timed out/i.test(details)
    )
        category = "timeout";
    else if (
        /EACCES|EPERM|ECONN|ENOTFOUND|EAI_AGAIN|ENET|EHOST|P1001|P1017|socket|network/i.test(
            details,
        )
    )
        category = "network";
    const safeNames = new Set([
        "Error",
        "TypeError",
        "AggregateError",
        "DriverAdapterError",
        "PrismaClientInitializationError",
        "PrismaClientKnownRequestError",
        "PrismaClientUnknownRequestError",
        "PrismaClientValidationError",
    ]);
    console.log(
        JSON.stringify({
            name: safeNames.has(error?.name) ? error.name : "Error",
            code: codes.has(error?.code) ? error.code : "unavailable",
            causeCodes: [...codes].filter((code) => code !== error?.code),
            category,
        }),
    );
}

async function main() {
    let prisma;
    let passed;

    try {
        // Keep loading and initialization inside try so failures stay private.
        prisma = require("../src/db").getPrisma();
        await prisma.$connect();
        const result = await prisma.$queryRaw`SELECT 1 AS ok`;
        passed = result.length === 1 && result[0].ok === 1;
    } catch (error) {
        reportError(error);
        passed = false;
    } finally {
        if (prisma) {
            try {
                await prisma.$disconnect();
            } catch (error) {
                reportError(error);
                passed = false;
            }
        }
    }

    console.log(
        passed
            ? "PASS: Database connection."
            : "FAIL: Database check. Verify local configuration, client generation, and database access.",
    );
    process.exitCode = passed ? 0 : 1;
}

main();
