const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const crypto = require("crypto");
const path = require("path");

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


// =====================================================
// FIREBASE ADMIN
// =====================================================

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {

    serviceAccount =
        JSON.parse(
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

    serviceAccount =
        require("./serviceAccountKey.json");
}


initializeApp({
    credential: cert(serviceAccount)
});


const auth = getAuth();
const db = getFirestore();


// =====================================================
// EXPRESS
// =====================================================

const app = express();

app.use(cors());

app.use(express.json());


// =====================================================
// SERVE YOUR WEBSITE
// =====================================================

// This makes http://localhost:3000
// load your index.html

app.use(
    express.static(__dirname)
);


// =====================================================
// AUTHENTICATION
// =====================================================

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


        if (
            decodedToken.admin !== true
        ) {

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


// =====================================================
// ACCOUNT EMAIL
// =====================================================

function getAccountEmail(code) {

    const hash =
        crypto
            .createHash("sha256")
            .update(code)
            .digest("hex");


    return `${hash}@coli-verify.firebaseapp.com`;
}


// =====================================================
// VERIFY CODE
// =====================================================

app.post(
    "/verify-code",
    async (req, res) => {

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


            // Normal code

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


            // Firebase account

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


            // Admin claim

            if (isAdminCode) {

                await auth.setCustomUserClaims(
                    userRecord.uid,
                    {
                        admin: true
                    }
                );

            } else {

                await auth.setCustomUserClaims(
                    userRecord.uid,
                    {
                        admin: false
                    }
                );

            }


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

    }
);


// =====================================================
// RANDOM CODE
// ADMIN ONLY
// =====================================================

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

                    createdAt:
                        Date.now(),

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


// =====================================================
// MUTE
// ADMIN ONLY
// =====================================================

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


// =====================================================
// UNMUTE
// ADMIN ONLY
// =====================================================

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


// =====================================================
// SEND MESSAGE
// =====================================================

app.post(
    "/send-message",
    verifyUserToken,
    async (req, res) => {

        try {

            const {
                username,
                text,
                color
            } = req.body;


            if (
                !username ||
                !text
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Missing message."

                });

            }


            // Check mute status

            const settings =
                await db
                    .collection("settings")
                    .doc("chat")
                    .get();


            const muted =
                settings.exists &&
                settings.data().muted === true;


            // Admins can still send while muted

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
                        String(username)
                            .slice(0, 30),

                    text:
                        String(text)
                            .slice(0, 2000),

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


// =====================================================
// CLEAR CHAT
// ADMIN ONLY
// =====================================================

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


// =====================================================
// START SERVER
// =====================================================

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