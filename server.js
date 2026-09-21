const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const crypto = require("crypto");

const {
    initializeApp,
    cert,
    getApps
} = require("firebase-admin/app");

const {
    getAuth
} = require("firebase-admin/auth");

const {
    getFirestore,
    FieldValue
} = require("firebase-admin/firestore");

dotenv.config();

const app = express();


// ============================================================
// FIREBASE ADMIN SETUP
// ============================================================

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    // IMPORTANT:
    // Render environment variables store \n as text.
    // Firebase Admin needs actual newline characters.
    if (serviceAccount.private_key) {
        serviceAccount.private_key =
            serviceAccount.private_key.replace(/\\n/g, "\n");
    }
} else {
    serviceAccount = require("./serviceAccountKey.json");
}

if (getApps().length === 0) {
    initializeApp({
        credential: cert(serviceAccount)
    });
}

const adminAuth = getAuth();
const db = getFirestore();


// ============================================================
// MIDDLEWARE
// ============================================================

app.use(cors());

app.use(express.json());

app.use(express.static(__dirname));


// ============================================================
// HELPER FUNCTIONS
// ============================================================

function hashCode(code) {
    return crypto
        .createHash("sha256")
        .update(code)
        .digest("hex");
}


function getAccountEmail(code) {
    return `${hashCode(code)}@coli-verify.firebaseapp.com`;
}


async function verifyUserToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Missing authentication token."
            });
        }

        const token = authHeader.substring(7);

        const decodedToken = await adminAuth.verifyIdToken(token);

        req.user = decodedToken;

        next();
    } catch (error) {
        console.error("User token verification failed:", error);

        return res.status(401).json({
            error: "Invalid authentication token."
        });
    }
}


async function verifyAdminToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                error: "Missing authentication token."
            });
        }

        const token = authHeader.substring(7);

        const decodedToken = await adminAuth.verifyIdToken(token);

        if (decodedToken.admin !== true) {
            return res.status(403).json({
                error: "Admin access required."
            });
        }

        req.user = decodedToken;

        next();
    } catch (error) {
        console.error("Admin token verification failed:", error);

        return res.status(401).json({
            error: "Invalid authentication token."
        });
    }
}


// ============================================================
// VERIFY ACCESS CODE
// ============================================================

app.post("/verify-code", async (req, res) => {
    try {
        const code = String(req.body.code || "").trim();

        if (!code) {
            return res.status(400).json({
                error: "Access code is required."
            });
        }

        const adminCode = String(process.env.ADMIN_CODE || "").trim();

        const isAdminCode =
            adminCode &&
            code === adminCode;

        let codeIsValid = isAdminCode;

        if (!isAdminCode) {
            const codeHash = hashCode(code);

            const codeRef = db.collection("codes").doc(codeHash);
            const codeSnap = await codeRef.get();

            if (codeSnap.exists) {
                const data = codeSnap.data();

                if (data && data.used !== true) {
                    codeIsValid = true;
                }
            }
        }

        if (!codeIsValid) {
            return res.status(401).json({
                error: "Invalid access code."
            });
        }

        const email = getAccountEmail(code);
        const password = code;

        let userRecord;

        try {
            userRecord = await adminAuth.getUserByEmail(email);
        } catch (error) {
            if (error.code === "auth/user-not-found") {
                userRecord = await adminAuth.createUser({
                    email: email,
                    password: password
                });
            } else {
                throw error;
            }
        }

        await adminAuth.updateUser(userRecord.uid, {
            password: password
        });

        await adminAuth.setCustomUserClaims(
            userRecord.uid,
            {
                admin: isAdminCode
            }
        );

        return res.json({
            success: true,
            admin: isAdminCode,
            email: email,
            password: password
        });

    } catch (error) {
        console.error("Verify-code error:", error);

        return res.status(500).json({
            error: "Server error while verifying access code."
        });
    }
});


// ============================================================
// GENERATE RANDOM ACCESS CODE
// ============================================================

app.post("/random-code", verifyAdminToken, async (req, res) => {
    try {
        let code;
        let exists = true;

        while (exists) {
            code = Math.floor(
                100000000 +
                Math.random() * 900000000
            ).toString();

            const hash = hashCode(code);

            const doc = await db
                .collection("codes")
                .doc(hash)
                .get();

            exists = doc.exists;
        }

        const hash = hashCode(code);

        await db
            .collection("codes")
            .doc(hash)
            .set({
                createdAt: FieldValue.serverTimestamp(),
                used: false
            });

        return res.json({
            success: true,
            code: code
        });

    } catch (error) {
        console.error("Random-code error:", error);

        return res.status(500).json({
            error: "Failed to generate random code."
        });
    }
});


// ============================================================
// GENERATE RANDOM NAME-CHANGE CODE
// ============================================================

app.post("/random-name-code", verifyAdminToken, async (req, res) => {
    try {
        let code;
        let exists = true;

        while (exists) {
            code = Math.floor(
                10000000 +
                Math.random() * 90000000
            ).toString();

            const doc = await db
                .collection("nameChangeCodes")
                .doc(code)
                .get();

            exists = doc.exists;
        }

        const expiresAt = Date.now() + (15 * 60 * 1000);

        await db
            .collection("nameChangeCodes")
            .doc(code)
            .set({
                createdAt: FieldValue.serverTimestamp(),
                expiresAt: expiresAt
            });

        return res.json({
            success: true,
            code: code,
            expiresAt: expiresAt
        });

    } catch (error) {
        console.error("Random-name-code error:", error);

        return res.status(500).json({
            error: "Failed to generate name-change code."
        });
    }
});


// ============================================================
// SET USERNAME
// ============================================================

app.post("/set-username", verifyUserToken, async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();

        if (!username) {
            return res.status(400).json({
                error: "Username is required."
            });
        }

        if (username.length > 30) {
            return res.status(400).json({
                error: "Username must be 30 characters or fewer."
            });
        }

        const profileRef = db
            .collection("profiles")
            .doc(req.user.uid);

        await profileRef.set({
            username: username
        });

        return res.json({
            success: true,
            username: username
        });

    } catch (error) {
        console.error("Set-username error:", error);

        return res.status(500).json({
            error: "Failed to set username."
        });
    }
});


// ============================================================
// CHANGE USERNAME
// ============================================================

app.post("/change-username", verifyUserToken, async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const code = String(req.body.code || "").trim();

        if (!username || !code) {
            return res.status(400).json({
                error: "Username and code are required."
            });
        }

        if (username.length > 30) {
            return res.status(400).json({
                error: "Username must be 30 characters or fewer."
            });
        }

        const codeRef = db
            .collection("nameChangeCodes")
            .doc(code);

        const profileRef = db
            .collection("profiles")
            .doc(req.user.uid);

        await db.runTransaction(async transaction => {
            const codeSnap = await transaction.get(codeRef);

            if (!codeSnap.exists) {
                throw new Error("INVALID_NAME_CODE");
            }

            const data = codeSnap.data();

            if (
                !data ||
                !data.expiresAt ||
                Date.now() > data.expiresAt
            ) {
                throw new Error("EXPIRED_NAME_CODE");
            }

            transaction.set(profileRef, {
                username: username
            }, {
                merge: true
            });

            transaction.delete(codeRef);
        });

        return res.json({
            success: true,
            username: username
        });

    } catch (error) {
        if (error.message === "INVALID_NAME_CODE") {
            return res.status(400).json({
                error: "Invalid name-change code."
            });
        }

        if (error.message === "EXPIRED_NAME_CODE") {
            return res.status(400).json({
                error: "That name-change code has expired."
            });
        }

        console.error("Change-username error:", error);

        return res.status(500).json({
            error: "Failed to change username."
        });
    }
});


// ============================================================
// GET PROFILE
// ============================================================

app.get("/profile", verifyUserToken, async (req, res) => {
    try {
        const profileSnap = await db
            .collection("profiles")
            .doc(req.user.uid)
            .get();

        if (!profileSnap.exists) {
            return res.json({
                success: true,
                profile: null
            });
        }

        return res.json({
            success: true,
            profile: profileSnap.data()
        });

    } catch (error) {
        console.error("Profile error:", error);

        return res.status(500).json({
            error: "Failed to load profile."
        });
    }
});


// ============================================================
// PROFILE PICTURE
// ============================================================

app.post("/profile-picture", verifyUserToken, async (req, res) => {
    try {
        const url = String(req.body.url || "").trim();

        if (url.length > 1000) {
            return res.status(400).json({
                error: "Profile picture URL is too long."
            });
        }

        if (url && !url.startsWith("https://")) {
            return res.status(400).json({
                error: "Profile picture must use HTTPS."
            });
        }

        const profileRef = db
            .collection("profiles")
            .doc(req.user.uid);

        const profileSnap = await profileRef.get();

        if (!profileSnap.exists) {
            return res.status(400).json({
                error: "Create a profile first."
            });
        }

        await profileRef.set({
            profilePicture: url
        }, {
            merge: true
        });

        return res.json({
            success: true,
            profilePicture: url
        });

    } catch (error) {
        console.error("Profile-picture error:", error);

        return res.status(500).json({
            error: "Failed to update profile picture."
        });
    }
});


// ============================================================
// MUTE CHAT
// ============================================================

app.post("/mute", verifyAdminToken, async (req, res) => {
    try {
        await db
            .collection("settings")
            .doc("chat")
            .set({
                muted: true
            }, {
                merge: true
            });

        return res.json({
            success: true,
            muted: true
        });

    } catch (error) {
        console.error("Mute error:", error);

        return res.status(500).json({
            error: "Failed to mute chat."
        });
    }
});


// ============================================================
// UNMUTE CHAT
// ============================================================

app.post("/unmute", verifyAdminToken, async (req, res) => {
    try {
        await db
            .collection("settings")
            .doc("chat")
            .set({
                muted: false
            }, {
                merge: true
            });

        return res.json({
            success: true,
            muted: false
        });

    } catch (error) {
        console.error("Unmute error:", error);

        return res.status(500).json({
            error: "Failed to unmute chat."
        });
    }
});


// ============================================================
// SEND MESSAGE
// ============================================================

app.post("/send-message", verifyUserToken, async (req, res) => {
    try {
        const text = String(req.body.text || "").trim();
        const color = String(req.body.color || "").trim();

        if (!text) {
            return res.status(400).json({
                error: "Message cannot be empty."
            });
        }

        if (text.length > 2000) {
            return res.status(400).json({
                error: "Message is too long."
            });
        }

        const profileSnap = await db
            .collection("profiles")
            .doc(req.user.uid)
            .get();

        if (!profileSnap.exists) {
            return res.status(400).json({
                error: "You must create a username first."
            });
        }

        const profile = profileSnap.data();

        const settingsSnap = await db
            .collection("settings")
            .doc("chat")
            .get();

        const settings = settingsSnap.exists
            ? settingsSnap.data()
            : {};

        if (settings.muted === true && req.user.admin !== true) {
            return res.status(403).json({
                error: "Chat is currently muted."
            });
        }

        await db.collection("messages").add({
            uid: req.user.uid,
            username: profile.username || "Unknown",
            text: text,
            color: color,
            timestamp: FieldValue.serverTimestamp()
        });

        return res.json({
            success: true
        });

    } catch (error) {
        console.error("Send-message error:", error);

        return res.status(500).json({
            error: "Failed to send message."
        });
    }
});


// ============================================================
// SEND WHISPER
// ============================================================

app.post("/send-whisper", verifyUserToken, async (req, res) => {
    try {
        const recipientUsername =
            String(req.body.recipientUsername || "").trim();

        const text =
            String(req.body.text || "").trim();

        if (!recipientUsername || !text) {
            return res.status(400).json({
                error: "Recipient and message are required."
            });
        }

        if (text.length > 2000) {
            return res.status(400).json({
                error: "Message is too long."
            });
        }

        const senderProfileSnap = await db
            .collection("profiles")
            .doc(req.user.uid)
            .get();

        if (!senderProfileSnap.exists) {
            return res.status(400).json({
                error: "You must create a username first."
            });
        }

        const senderProfile = senderProfileSnap.data();

        const profilesSnap = await db
            .collection("profiles")
            .where("username", "==", recipientUsername)
            .limit(1)
            .get();

        if (profilesSnap.empty) {
            return res.status(404).json({
                error: "User not found."
            });
        }

        const recipientDoc = profilesSnap.docs[0];

        await db.collection("whispers").add({
            senderUid: req.user.uid,
            senderUsername: senderProfile.username || "Unknown",
            recipientUid: recipientDoc.id,
            recipientUsername: recipientUsername,
            text: text,
            timestamp: FieldValue.serverTimestamp()
        });

        return res.json({
            success: true
        });

    } catch (error) {
        console.error("Send-whisper error:", error);

        return res.status(500).json({
            error: "Failed to send whisper."
        });
    }
});


// ============================================================
// CLEAR CHAT
// ============================================================

app.post("/clear", verifyAdminToken, async (req, res) => {
    try {
        const messagesRef = db.collection("messages");

        let snapshot = await messagesRef.limit(500).get();

        let deleted = 0;

        while (!snapshot.empty) {
            const batch = db.batch();

            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });

            await batch.commit();

            deleted += snapshot.size;

            snapshot = await messagesRef.limit(500).get();
        }

        return res.json({
            success: true,
            deleted: deleted
        });

    } catch (error) {
        console.error("Clear error:", error);

        return res.status(500).json({
            error: "Failed to clear chat."
        });
    }
});


// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/health", (req, res) => {
    res.json({
        success: true,
        message: "Coli Verify server is running."
    });
});


// ============================================================
// START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Coli Verify server running on port ${PORT}`);
});