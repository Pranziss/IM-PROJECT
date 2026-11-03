const dns = require("node:dns");
if (dns.setDefaultResultOrder) dns.setDefaultResultOrder("ipv4first");
const { execSync } = require("node:child_process");
const bcrypt = require("bcryptjs");
const { getPrisma } = require("../src/db");
const { deployProcedures } = require("./deploy-procedures");

const roles = [
    "System Administrator",
    "Facility/Maintenance Staff",
    "Faculty / Student Organization Representative",
];

const reservationStatuses = ["Pending", "Approved", "Rejected", "Cancelled"];

const facilityTypes = [
    "Classroom",
    "Lecture Hall",
    "Laboratory",
    "Computer Laboratory",
    "Conference Room",
    "Auditorium",
    "Gymnasium",
    "Study Room",
];

const equipmentCategories = [
    "Audio Visual Equipment",
    "Computer Equipment",
    "Laboratory Equipment",
    "Sports Equipment",
    "Furniture",
    "Maintenance Tools",
];

async function seed() {
    const prisma = getPrisma();

    // 0. Ensure schema tables exist (auto push if not yet created)
    try {
        await prisma.role.findFirst({ select: { roleId: true } });
    } catch {
        console.log(
            "Database schema not found. Initializing schema with prisma db push...",
        );
        execSync(
            "npx prisma db push --config prisma7.config.ts --skip-generate",
            {
                stdio: "inherit",
                env: process.env,
                shell: true,
            },
        );
    }

    // 0.1 Ensure im101_private stored procedures, functions, and triggers exist
    try {
        await deployProcedures();
    } catch (procError) {
        console.warn(
            "Notice: Stored procedure deployment warning:",
            procError.message || procError,
        );
    }

    console.log("Seeding database lookups...");

    // 1. Roles
    for (const roleName of roles) {
        await prisma.role.upsert({
            where: { roleName },
            create: { roleName },
            update: {},
        });
    }
    console.log(`- Upserted ${roles.length} roles.`);

    // 2. Reservation Statuses
    for (const statusName of reservationStatuses) {
        await prisma.reservationStatus.upsert({
            where: { statusName },
            create: { statusName },
            update: {},
        });
    }
    console.log(
        `- Upserted ${reservationStatuses.length} reservation statuses.`,
    );

    // 3. Facility Types
    for (const typeName of facilityTypes) {
        await prisma.facilityType.upsert({
            where: { typeName },
            create: { typeName },
            update: {},
        });
    }
    console.log(`- Upserted ${facilityTypes.length} facility types.`);

    // 4. Equipment Categories
    for (const categoryName of equipmentCategories) {
        await prisma.equipmentCategory.upsert({
            where: { categoryName },
            create: { categoryName },
            update: {},
        });
    }
    console.log(
        `- Upserted ${equipmentCategories.length} equipment categories.`,
    );

    // 5. Optional Initial Administrator Account
    const email = process.env.PROVISION_ADMIN_EMAIL?.trim()?.toLowerCase();
    const password = process.env.PROVISION_ADMIN_PASSWORD;
    const fname = process.env.PROVISION_ADMIN_FIRST_NAME?.trim() || "System";
    const lname =
        process.env.PROVISION_ADMIN_LAST_NAME?.trim() || "Administrator";

    if (email && password) {
        if (password.length < 15 || Buffer.byteLength(password) > 72) {
            console.warn(
                "Skipping administrator creation: PROVISION_ADMIN_PASSWORD must be between 15 and 72 characters.",
            );
        } else {
            const adminRole = await prisma.role.findUnique({
                where: { roleName: roles[0] },
                select: { roleId: true },
            });
            if (adminRole) {
                const existing = await prisma.user.findUnique({
                    where: { email },
                    select: { userId: true },
                });
                if (!existing) {
                    const passwordHash = await bcrypt.hash(password, 12);
                    await prisma.user.create({
                        data: {
                            email,
                            fname,
                            lname,
                            passwordHash,
                            roleId: adminRole.roleId,
                            isActive: true,
                        },
                    });
                    console.log(`- Created initial administrator: ${email}`);
                } else {
                    console.log(`- Administrator already exists: ${email}`);
                }
            }
        }
    } else {
        console.log(
            "- No PROVISION_ADMIN_EMAIL and PROVISION_ADMIN_PASSWORD provided; skipping admin creation.",
        );
    }

    console.log("Database seeding completed successfully.");
}

seed()
    .catch((error) => {
        console.error("Database seeding failed:", error.message || error);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            const prisma = getPrisma();
            await prisma.$disconnect();
        } catch {
            // Ignore disconnect error during process exit
        }
    });
