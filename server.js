const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const crypto = require("crypto");

const {
    initializeApp,
    cert
} = require("firebase-admin/app");

const {
    getAuth
} = require("firebase-admin/auth");

const {
    getFirestore
} = require("firebase-admin/firestore");

dotenv.config();

/* =====================================================
   FIREBASE ADMIN
   ===================================================== */

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(
        process.env.FIREBASE_SERVICE_ACCOUNT
    );

    if (serviceAccount.private_key) {
        serviceAccount.private_key =
            serviceAccount.private_key.replace(
                /\\n/g,
                "\n"
            );
    }
} else {
    serviceAccount = require("./serviceAccountKey.json");
}

initializeApp({
    credential: cert(serviceAccount)
});

const auth = getAuth();
const db = getFirestore();

/* =====================================================
   EXPRESS
   ===================================================== */

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

/* =====================================================
   AUTHENTICATION
   ===================================================== */

async function verifyUserToken(req, res, next) {
    try {
        const authorization =
            req.headers.authorization;

        if (
            !authorization ||
            !authorization.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized."
            });
        }

        const idToken =
            authorization.substring(7);

        const decodedToken =
            await auth.verifyIdToken(idToken);

        req.user = decodedToken;

        next();
    } catch (error) {
        console.error(
            "User authentication error:",
            error
        );

        return res.status(401).json({
            success: false,
            message: "Invalid authentication."
        });
    }
}

async function verifyAdminToken(req, res, next) {
    try {
        const authorization =
            req.headers.authorization;

        if (
            !authorization ||
            !authorization.startsWith("Bearer ")
        ) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized."
            });
        }

        const idToken =
            authorization.substring(7);

        const decodedToken =
            await auth.verifyIdToken(idToken);

        if (decodedToken.admin !== true) {
            return res.status(403).json({
                success: false,
                message: "Admin permission required."
            });
        }

        req.user = decodedToken;

        next();
    } catch (error) {
        console.error(
            "Admin authentication error:",
            error
        );

        return res.status(401).json({
            success: false,
            message: "Invalid authentication."
        });
    }
}

/* =====================================================
   ACCOUNT EMAIL
   ===================================================== */

function getAccountEmail(code) {
    const hash =
        crypto
            .createHash("sha256")
            .update(code)
            .digest("hex");

    return `${hash}@coli-verify.firebaseapp.com`;
}

/* =====================================================
   VERIFY ACCESS CODE
   ===================================================== */

app.post("/verify-code", async (req, res) => {
    try {
        const code =
            String(
                req.body.code || ""
            ).trim();

        if (!code) {
            return res.status(400).json({
                success: false,
                message: "Missing code."
            });
        }

        const isAdminCode =
            code === process.env.ADMIN_CODE;

        if (!isAdminCode) {
            const snapshot =
                await db
                    .collection("codes")
                    .where(
                        "code",
                        "==",
                        code
                    )
                    .limit(1)
                    .get();

            if (snapshot.empty) {
                return res.json({
                    success: false,
                    message: "Invalid code."
                });
            }
        }

        const email =
            getAccountEmail(code);

        let userRecord;

        try {
            userRecord =
                await auth.getUserByEmail(
                    email
                );
        } catch (error) {
            if (
                error.code !==
                "auth/user-not-found"
            ) {
                throw error;
            }

            userRecord =
                await auth.createUser({
                    email,
                    password: code,
                    emailVerified: true
                });
        }

        await auth.setCustomUserClaims(
            userRecord.uid,
            {
                admin: isAdminCode
            }
        );

        return res.json({
            success: true,
            admin: isAdminCode,
            email,
            password: code
        });

    } catch (error) {
        console.error(
            "Verification error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Server error."
        });
    }
});

/* =====================================================
   RANDOM ACCESS CODE
   ADMIN ONLY
   ===================================================== */

app.post(
    "/random-code",
    verifyAdminToken,
    async (req, res) => {
        try {
            let newCode = "";
            let exists = true;

            while (exists) {
                newCode =
                    crypto
                        .randomInt(
                            100000000,
                            1000000000
                        )
                        .toString();

                const existing =
                    await db
                        .collection("codes")
                        .where(
                            "code",
                            "==",
                            newCode
                        )
                        .limit(1)
                        .get();

                exists =
                    !existing.empty;
            }

            await db
                .collection("codes")
                .add({
                    code: newCode,
                    createdAt: Date.now(),
                    createdBy:
                        req.user.uid
                });

            return res.json({
                success: true,
                code: newCode
            });

        } catch (error) {
            console.error(
                "Random code error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not generate code."
            });
        }
    }
);

/* =====================================================
   RANDOM NAME-CHANGE CODE
   ADMIN ONLY
   ===================================================== */

app.post(
    "/random-name-code",
    verifyAdminToken,
    async (req, res) => {
        try {
            let newCode = "";
            let exists = true;

            while (exists) {
                newCode =
                    crypto
                        .randomInt(
                            10000000,
                            100000000
                        )
                        .toString();

                const existing =
                    await db
                        .collection(
                            "nameChangeCodes"
                        )
                        .doc(newCode)
                        .get();

                exists =
                    existing.exists;
            }

            const createdAt =
                Date.now();

            const expiresAt =
                createdAt +
                15 * 60 * 1000;

            await db
                .collection(
                    "nameChangeCodes"
                )
                .doc(newCode)
                .set({
                    code: newCode,
                    createdAt,
                    expiresAt,
                    createdBy:
                        req.user.uid
                });

            return res.json({
                success: true,
                code: newCode,
                expiresInMinutes: 15
            });

        } catch (error) {
            console.error(
                "Random name code error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not generate name-change code."
            });
        }
    }
);

/* =====================================================
   INITIAL USERNAME
   ===================================================== */

app.post(
    "/set-username",
    verifyUserToken,
    async (req, res) => {
        try {
            const username =
                String(
                    req.body.username || ""
                ).trim();

            if (!username) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Username is required."
                });
            }

            if (username.length > 30) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Username must be 30 characters or less."
                });
            }

            const profileRef =
                db
                    .collection("profiles")
                    .doc(req.user.uid);

            const existing =
                await profileRef.get();

            if (existing.exists) {
                return res.status(409).json({
                    success: false,
                    message:
                        "Username already exists. A name-change code is required."
                });
            }

            await profileRef.set({
                username,
                updatedAt: Date.now()
            });

            return res.json({
                success: true,
                username
            });

        } catch (error) {
            console.error(
                "Set username error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not save username."
            });
        }
    }
);

/* =====================================================
   CHANGE USERNAME
   ONE-TIME CODE REQUIRED
   ===================================================== */

app.post(
    "/change-username",
    verifyUserToken,
    async (req, res) => {
        try {
            const username =
                String(
                    req.body.username || ""
                ).trim();

            const code =
                String(
                    req.body.code || ""
                ).trim();

            if (!username) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Enter a new username."
                });
            }

            if (username.length > 30) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Username must be 30 characters or less."
                });
            }

            if (!code) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Enter a name-change code."
                });
            }

            const codeRef =
                db
                    .collection(
                        "nameChangeCodes"
                    )
                    .doc(code);

            const profileRef =
                db
                    .collection("profiles")
                    .doc(req.user.uid);

            await db.runTransaction(
                async transaction => {
                    const codeSnapshot =
                        await transaction.get(
                            codeRef
                        );

                    if (!codeSnapshot.exists) {
                        const error =
                            new Error(
                                "Invalid or already-used name-change code."
                            );

                        error.code =
                            "INVALID_NAME_CODE";

                        throw error;
                    }

                    const codeData =
                        codeSnapshot.data();

                    if (
                        !codeData.expiresAt ||
                        Date.now() >
                            codeData.expiresAt
                    ) {
                        const error =
                            new Error(
                                "That name-change code has expired."
                            );

                        error.code =
                            "EXPIRED_NAME_CODE";

                        throw error;
                    }

                    transaction.set(
                        profileRef,
                        {
                            username,
                            updatedAt:
                                Date.now()
                        },
                        {
                            merge: true
                        }
                    );

                    transaction.delete(
                        codeRef
                    );
                }
            );

            return res.json({
                success: true,
                username
            });

        } catch (error) {
            if (
                error.code ===
                "INVALID_NAME_CODE"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid or already-used name-change code."
                });
            }

            if (
                error.code ===
                "EXPIRED_NAME_CODE"
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "That name-change code has expired."
                });
            }

            console.error(
                "Change username error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not change username."
            });
        }
    }
);

/* =====================================================
   GET CURRENT PROFILE
   ===================================================== */

app.get(
    "/profile",
    verifyUserToken,
    async (req, res) => {
        try {
            const profile =
                await db
                    .collection("profiles")
                    .doc(req.user.uid)
                    .get();

            if (!profile.exists) {
                return res.json({
                    success: true,
                    username: null
                });
            }

            const data =
                profile.data();

            return res.json({
                success: true,
                username:
                    data.username || null
            });

        } catch (error) {
            console.error(
                "Get profile error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not load profile."
            });
        }
    }
);

/* =====================================================
   MUTE CHAT
   ADMIN ONLY
   ===================================================== */

app.post(
    "/mute",
    verifyAdminToken,
    async (req, res) => {
        try {
            await db
                .collection("settings")
                .doc("chat")
                .set({
                    muted: true,
                    updatedAt:
                        Date.now(),
                    updatedBy:
                        req.user.uid
                });

            return res.json({
                success: true,
                muted: true
            });

        } catch (error) {
            console.error(
                "Mute error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not mute chat."
            });
        }
    }
);

/* =====================================================
   UNMUTE CHAT
   ADMIN ONLY
   ===================================================== */

app.post(
    "/unmute",
    verifyAdminToken,
    async (req, res) => {
        try {
            await db
                .collection("settings")
                .doc("chat")
                .set({
                    muted: false,
                    updatedAt:
                        Date.now(),
                    updatedBy:
                        req.user.uid
                });

            return res.json({
                success: true,
                muted: false
            });

        } catch (error) {
            console.error(
                "Unmute error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not unmute chat."
            });
        }
    }
);

/* =====================================================
   SEND NORMAL MESSAGE
   ===================================================== */

app.post(
    "/send-message",
    verifyUserToken,
    async (req, res) => {
        try {
            const {
                text,
                color
            } = req.body;

            if (!text) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Missing message."
                });
            }

            const profile =
                await db
                    .collection("profiles")
                    .doc(req.user.uid)
                    .get();

            if (!profile.exists) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Set your username first."
                });
            }

            const profileData =
                profile.data();

            const username =
                String(
                    profileData.username || ""
                ).trim();

            if (!username) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Set your username first."
                });
            }

            const settings =
                await db
                    .collection("settings")
                    .doc("chat")
                    .get();

            const muted =
                settings.exists &&
                settings.data().muted === true;

            if (
                muted &&
                req.user.admin !== true
            ) {
                return res.status(403).json({
                    success: false,
                    muted: true,
                    message:
                        "The chat is currently muted."
                });
            }

            await db
                .collection("messages")
                .add({
                    username:
                        username.slice(
                            0,
                            30
                        ),
                    text:
                        String(text)
                            .slice(
                                0,
                                2000
                            ),
                    color:
                        String(
                            color ||
                            "#4285F4"
                        ),
                    timestamp:
                        Date.now(),
                    uid:
                        req.user.uid
                });

            return res.json({
                success: true
            });

        } catch (error) {
            console.error(
                "Send message error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not send message."
            });
        }
    }
);

/* =====================================================
   SEND WHISPER
   ===================================================== */

app.post(
    "/send-whisper",
    verifyUserToken,
    async (req, res) => {
        try {
            const targetUsername =
                String(
                    req.body.username || ""
                ).trim();

            const messageText =
                String(
                    req.body.text || ""
                ).trim();

            const color =
                String(
                    req.body.color ||
                    "#4285F4"
                );

            if (!targetUsername) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Missing username."
                });
            }

            if (!messageText) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Missing message."
                });
            }

            if (messageText.length > 2000) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Message is too long."
                });
            }

            const senderProfile =
                await db
                    .collection("profiles")
                    .doc(req.user.uid)
                    .get();

            if (!senderProfile.exists) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Set your username first."
                });
            }

            const senderData =
                senderProfile.data();

            const senderUsername =
                String(
                    senderData.username || ""
                ).trim();

            if (!senderUsername) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Set your username first."
                });
            }

            const recipientSnapshot =
                await db
                    .collection("profiles")
                    .where(
                        "username",
                        "==",
                        targetUsername
                    )
                    .limit(1)
                    .get();

            if (recipientSnapshot.empty) {
                return res.status(404).json({
                    success: false,
                    message:
                        `User "${targetUsername}" was not found.`
                });
            }

            const recipientDoc =
                recipientSnapshot.docs[0];

            const recipientUid =
                recipientDoc.id;

            if (
                recipientUid ===
                req.user.uid
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "You cannot whisper yourself."
                });
            }

            await db
                .collection("whispers")
                .add({
                    senderUid:
                        req.user.uid,
                    senderUsername:
                        senderUsername,
                    recipientUid:
                        recipientUid,
                    recipientUsername:
                        targetUsername,
                    text:
                        messageText,
                    color:
                        color,
                    timestamp:
                        Date.now()
                });

            return res.json({
                success: true
            });

        } catch (error) {
            console.error(
                "Whisper error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not send whisper."
            });
        }
    }
);

/* =====================================================
   CLEAR CHAT
   ADMIN ONLY
   ===================================================== */

app.post(
    "/clear",
    verifyAdminToken,
    async (req, res) => {
        try {
            const snapshot =
                await db
                    .collection("messages")
                    .get();

            if (snapshot.empty) {
                return res.json({
                    success: true,
                    deleted: 0
                });
            }

            const batchLimit = 500;
            let deleted = 0;

            for (
                let i = 0;
                i < snapshot.docs.length;
                i += batchLimit
            ) {
                const batch =
                    db.batch();

                const chunk =
                    snapshot.docs.slice(
                        i,
                        i + batchLimit
                    );

                for (
                    const messageDoc
                    of chunk
                ) {
                    batch.delete(
                        messageDoc.ref
                    );

                    deleted++;
                }

                await batch.commit();
            }

            return res.json({
                success: true,
                deleted
            });

        } catch (error) {
            console.error(
                "Clear chat error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Could not clear chat."
            });
        }
    }
);

/* =====================================================
   START SERVER
   ===================================================== */

const PORT =
    process.env.PORT || 3000;

app.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            `Open http://localhost:${PORT}`
        );
    }
);