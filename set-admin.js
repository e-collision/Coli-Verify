const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const serviceAccount = require("./serviceAccountKey.json");

initializeApp({
    credential: cert(serviceAccount)
});

const ADMIN_UID = "PRfmWREMhSgBdStXSdBVpb8N0C13";

async function setAdmin() {
    await getAuth().setCustomUserClaims(ADMIN_UID, {
        admin: true
    });

    console.log("Admin access granted successfully.");
    console.log("UID:", ADMIN_UID);
}

setAdmin().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});