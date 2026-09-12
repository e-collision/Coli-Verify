import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getFirestore,
    collection,
    query,
    orderBy,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    getIdTokenResult
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";


/* =========================
   FIREBASE
   ========================= */

const firebaseConfig = {
    apiKey: "AIzaSyBAVEXNzezY4jSnnq-qJMRM2HiBWIDLoBE",
    authDomain: "coli-verify.firebaseapp.com",
    projectId: "coli-verify",
    storageBucket: "coli-verify.firebasestorage.app",
    messagingSenderId: "381427299869",
    appId: "1:381427299869:web:47c5d7cdd834f2700178f4",
    measurementId: "G-BW9C2WE4Q5"
};

const app = initializeApp(firebaseConfig);

const db = getFirestore(app);

const auth = getAuth(app);


/* =========================
   SERVER
   ========================= */

const SERVER_URL = "http://localhost:3000";


/* =========================
   ELEMENTS
   ========================= */

const loginScreen =
    document.getElementById("loginScreen");

const usernameScreen =
    document.getElementById("usernameScreen");

const chatScreen =
    document.getElementById("chatScreen");

const codeInput =
    document.getElementById("codeInput");

const joinButton =
    document.getElementById("joinButton");

const errorMessage =
    document.getElementById("errorMessage");

const usernameInput =
    document.getElementById("usernameInput");

const usernameButton =
    document.getElementById("usernameButton");

const usernameError =
    document.getElementById("usernameError");

const colorInput =
    document.getElementById("colorInput");

const messageInput =
    document.getElementById("messageInput");

const sendButton =
    document.getElementById("sendButton");

const messagesContainer =
    document.getElementById("messages");


/* =========================
   STATE
   ========================= */

let currentUserCode = null;

let currentUsername = null;

let currentColor = "#4285F4";

let isAdmin = false;

let stopMessageListener = null;


/* =========================
   LOCAL USER STORAGE
   ========================= */

function getSavedUsers() {
    try {
        return JSON.parse(
            localStorage.getItem("coliChatUsers") || "{}"
        );
    } catch {
        return {};
    }
}


function saveUser(code, username, color) {
    const users = getSavedUsers();

    users[code] = {
        username,
        color
    };

    localStorage.setItem(
        "coliChatUsers",
        JSON.stringify(users)
    );
}


function getSavedUser(code) {
    const users = getSavedUsers();

    return users[code] || null;
}


/* =========================
   SCREEN CONTROL
   ========================= */

function showScreen(screen) {

    if (loginScreen) {
        loginScreen.style.display =
            screen === "login"
                ? "block"
                : "none";
    }

    if (usernameScreen) {
        usernameScreen.style.display =
            screen === "username"
                ? "block"
                : "none";
    }

    if (chatScreen) {
        chatScreen.style.display =
            screen === "chat"
                ? "flex"
                : "none";
    }
}


/* =========================
   NOTIFICATIONS
   ========================= */

function showNotification(message) {

    const notification =
        document.createElement("div");

    notification.textContent = message;

    notification.style.position = "fixed";

    notification.style.bottom = "25px";

    notification.style.left = "50%";

    notification.style.transform =
        "translateX(-50%)";

    notification.style.background = "#222";

    notification.style.color = "white";

    notification.style.padding =
        "12px 20px";

    notification.style.borderRadius = "10px";

    notification.style.fontSize = "14px";

    notification.style.zIndex = "99999";

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}


/* =========================
   ADMIN CHECK
   ========================= */

async function checkAdminStatus() {

    try {

        const user = auth.currentUser;

        if (!user) {
            isAdmin = false;
            return false;
        }

        const tokenResult =
            await getIdTokenResult(
                user,
                true
            );

        isAdmin =
            tokenResult.claims.admin === true;

        return isAdmin;

    } catch (error) {

        console.error(
            "Admin check error:",
            error
        );

        isAdmin = false;

        return false;
    }
}


/* =========================
   JOIN CHAT
   ========================= */

if (joinButton) {

    joinButton.addEventListener(
        "click",
        async () => {

            const code =
                String(
                    codeInput?.value || ""
                ).trim();

            if (!code) {

                if (errorMessage) {
                    errorMessage.textContent =
                        "Enter a code.";
                }

                return;
            }

            joinButton.disabled = true;

            if (errorMessage) {
                errorMessage.textContent =
                    "Checking code...";
            }

            try {

                const response =
                    await fetch(
                        `${SERVER_URL}/verify-code`,
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                code
                            })
                        }
                    );

                if (!response.ok) {

                    throw new Error(
                        `Verification server returned ${response.status}`
                    );
                }

                const result =
                    await response.json();

                if (!result.success) {

                    if (errorMessage) {
                        errorMessage.textContent =
                            result.message ||
                            "Invalid code.";
                    }

                    return;
                }


                await signInWithEmailAndPassword(
                    auth,
                    result.email,
                    result.password
                );


                await checkAdminStatus();


                currentUserCode = code;


                const savedUser =
                    getSavedUser(code);

                if (savedUser) {

                    currentUsername =
                        savedUser.username;

                    currentColor =
                        savedUser.color ||
                        "#4285F4";

                    if (colorInput) {
                        colorInput.value =
                            currentColor;
                    }

                    showScreen("chat");

                    loadMessages();

                } else {

                    showScreen("username");

                    if (usernameInput) {
                        usernameInput.value = "";
                        usernameInput.focus();
                    }
                }

            } catch (error) {

                console.error(
                    "Code verification error:",
                    error
                );

                if (errorMessage) {

                    if (
                        error.code ===
                        "auth/invalid-credential"
                    ) {

                        errorMessage.textContent =
                            "The code was accepted, but Firebase login failed.";

                    } else if (
                        error.code ===
                        "auth/api-key-not-valid"
                    ) {

                        errorMessage.textContent =
                            "Firebase API key is invalid.";

                    } else if (
                        error.message &&
                        error.message.includes(
                            "Failed to fetch"
                        )
                    ) {

                        errorMessage.textContent =
                            "Cannot connect to verification server. Make sure Node.js is running.";

                    } else {

                        errorMessage.textContent =
                            error.message ||
                            "Could not connect to verification server.";
                    }
                }

            } finally {

                joinButton.disabled = false;
            }
        }
    );
}


/* =========================
   ENTER CODE WITH ENTER
   ========================= */

if (codeInput) {

    codeInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {
                joinButton?.click();
            }
        }
    );
}


/* =========================
   USERNAME
   ========================= */

if (usernameButton) {

    usernameButton.addEventListener(
        "click",
        async () => {

            const username =
                String(
                    usernameInput?.value || ""
                ).trim();

            if (!username) {

                if (usernameError) {
                    usernameError.textContent =
                        "Enter a username.";
                }

                return;
            }

            if (username.length > 30) {

                if (usernameError) {
                    usernameError.textContent =
                        "Username must be 30 characters or less.";
                }

                return;
            }

            currentUsername = username;

            currentColor =
                colorInput?.value ||
                "#4285F4";

            saveUser(
                currentUserCode,
                currentUsername,
                currentColor
            );

            showScreen("chat");

            loadMessages();
        }
    );
}


/* =========================
   ENTER USERNAME WITH ENTER
   ========================= */

if (usernameInput) {

    usernameInput.addEventListener(
        "keydown",
        event => {

            if (event.key === "Enter") {
                usernameButton?.click();
            }
        }
    );
}


/* =========================
   COLOR
   ========================= */

if (colorInput) {

    colorInput.addEventListener(
        "input",
        () => {

            currentColor =
                colorInput.value ||
                "#4285F4";

            if (
                currentUserCode &&
                currentUsername
            ) {

                saveUser(
                    currentUserCode,
                    currentUsername,
                    currentColor
                );
            }
        }
    );
}


/* =========================
   AUTH TOKEN
   ========================= */

async function getAuthToken() {

    const user = auth.currentUser;

    if (!user) {
        throw new Error(
            "You are not signed in."
        );
    }

    return await user.getIdToken(true);
}


/* =========================
   RANDOM CODE
   ========================= */

async function generateRandomCode() {

    if (!isAdmin) {

        showNotification(
            "You do not have permission to use this command."
        );

        return;
    }

    try {

        const token =
            await getAuthToken();

        const response =
            await fetch(
                `${SERVER_URL}/random-code`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );

        const result =
            await response.json();

        if (!result.success) {

            throw new Error(
                result.message ||
                "Could not generate code."
            );
        }

        showNotification(
            `New code: ${result.code}`
        );

        console.log(
            "Generated code:",
            result.code
        );

    } catch (error) {

        console.error(
            "Random code error:",
            error
        );

        showNotification(
            error.message ||
            "Could not generate code."
        );
    }
}


/* =========================
   MUTE USER
   ========================= */

async function muteChat(username) {

    if (!isAdmin) {

        showNotification(
            "You do not have permission to mute users."
        );

        return;
    }

    if (!username) {

        showNotification(
            "Usage: /mute <username>"
        );

        return;
    }

    try {

        const token =
            await getAuthToken();

        const response =
            await fetch(
                `${SERVER_URL}/mute`,
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        username: username
                    })
                }
            );

        const result =
            await response.json();

        if (!result.success) {

            throw new Error(
                result.message ||
                "Could not mute user."
            );
        }

        showNotification(
            `${result.username} has been muted.`
        );

    } catch (error) {

        console.error(
            "Mute error:",
            error
        );

        showNotification(
            error.message ||
            "Could not mute user."
        );
    }
}


/* =========================
   UNMUTE USER
   ========================= */

async function unmuteChat(username) {

    if (!isAdmin) {

        showNotification(
            "You do not have permission to unmute users."
        );

        return;
    }

    if (!username) {

        showNotification(
            "Usage: /unmute <username>"
        );

        return;
    }

    try {

        const token =
            await getAuthToken();

        const response =
            await fetch(
                `${SERVER_URL}/unmute`,
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        username: username
                    })
                }
            );

        const result =
            await response.json();

        if (!result.success) {

            throw new Error(
                result.message ||
                "Could not unmute user."
            );
        }

        showNotification(
            `${result.username} has been unmuted.`
        );

    } catch (error) {

        console.error(
            "Unmute error:",
            error
        );

        showNotification(
            error.message ||
            "Could not unmute user."
        );
    }
}


/* =========================
   CLEAR CHAT
   ========================= */

async function clearChat() {

    if (!isAdmin) {

        showNotification(
            "You do not have permission to clear the chat."
        );

        return;
    }

    try {

        const token =
            await getAuthToken();

        const response =
            await fetch(
                `${SERVER_URL}/clear`,
                {
                    method: "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    }
                }
            );

        const result =
            await response.json();

        if (!result.success) {

            throw new Error(
                result.message ||
                "Could not clear chat."
            );
        }

        showNotification(
            `Chat cleared (${result.deleted || 0} messages).`
        );

    } catch (error) {

        console.error(
            "Clear chat error:",
            error
        );

        showNotification(
            error.message ||
            "Could not clear chat."
        );
    }
}


/* =========================
   SEND MESSAGE
   ========================= */

async function sendMessage() {

    const text =
        String(
            messageInput?.value || ""
        ).trim();

    if (!text) {
        return;
    }


    /* /random_code */

    if (text === "/random_code") {

        if (messageInput) {
            messageInput.value = "";
        }

        await generateRandomCode();

        return;
    }


    /* /mute <username> */

    if (
        text.startsWith("/mute ") &&
        text.length > 6
    ) {

        const username =
            text.substring(6).trim();

        if (messageInput) {
            messageInput.value = "";
        }

        await muteChat(username);

        return;
    }


    /* /unmute <username> */

    if (
        text.startsWith("/unmute ") &&
        text.length > 8
    ) {

        const username =
            text.substring(8).trim();

        if (messageInput) {
            messageInput.value = "";
        }

        await unmuteChat(username);

        return;
    }


    /* /mute without username */

    if (text === "/mute") {

        if (messageInput) {
            messageInput.value = "";
        }

        showNotification(
            "Usage: /mute <username>"
        );

        return;
    }


    /* /unmute without username */

    if (text === "/unmute") {

        if (messageInput) {
            messageInput.value = "";
        }

        showNotification(
            "Usage: /unmute <username>"
        );

        return;
    }


    /* /clear */

    if (text === "/clear") {

        if (messageInput) {
            messageInput.value = "";
        }

        await clearChat();

        return;
    }


    /* Normal message */

    if (!currentUsername) {

        showNotification(
            "Set your username first."
        );

        return;
    }


    try {

        sendButton.disabled = true;


        const token =
            await getAuthToken();


        const response =
            await fetch(
                `${SERVER_URL}/send-message`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${token}`
                    },

                    body: JSON.stringify({
                        username:
                            currentUsername,

                        text,

                        color:
                            currentColor
                    })
                }
            );


        const result =
            await response.json();


        if (!result.success) {

            if (result.muted) {

                showNotification(
                    "You are muted."
                );

            } else {

                showNotification(
                    result.message ||
                    "Could not send message."
                );
            }

            return;
        }


        if (messageInput) {
            messageInput.value = "";
        }

    } catch (error) {

        console.error(
            "Send message error:",
            error
        );

        showNotification(
            error.message ||
            "Could not send message."
        );

    } finally {

        sendButton.disabled = false;
    }
}


/* =========================
   SEND BUTTON
   ========================= */

if (sendButton) {

    sendButton.addEventListener(
        "click",
        sendMessage
    );
}


/* =========================
   ENTER TO SEND
   ========================= */

if (messageInput) {

    messageInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" &&
                !event.shiftKey
            ) {

                event.preventDefault();

                sendMessage();
            }
        }
    );
}


/* =========================
   LIVE MESSAGES
   ========================= */

function loadMessages() {

    if (!messagesContainer) {
        return;
    }


    /* Stop old listener */

    if (stopMessageListener) {

        stopMessageListener();

        stopMessageListener = null;
    }


    const messagesQuery =
        query(
            collection(
                db,
                "messages"
            ),

            orderBy(
                "timestamp",
                "asc"
            )
        );


    stopMessageListener =
        onSnapshot(
            messagesQuery,

            snapshot => {

                /*
                 * Check if the user is already
                 * near the bottom.
                 */

                const wasNearBottom =
                    messagesContainer.scrollHeight -
                    messagesContainer.scrollTop -
                    messagesContainer.clientHeight <
                    100;


                /*
                 * Save the current scroll
                 * position.
                 */

                const oldScrollTop =
                    messagesContainer.scrollTop;


                /*
                 * Rebuild messages.
                 */

                messagesContainer.innerHTML = "";


                snapshot.forEach(
                    doc => {

                        const data =
                            doc.data();


                        const messageElement =
                            document.createElement(
                                "div"
                            );


                        messageElement.className =
                            "message";


                        const usernameElement =
                            document.createElement(
                                "strong"
                            );


                        usernameElement.textContent =
                            data.username ||
                            "Unknown";


                        usernameElement.style.color =
                            data.color ||
                            "#4285F4";


                        const textElement =
                            document.createElement(
                                "span"
                            );


                        textElement.textContent =
                            `: ${data.text || ""}`;


                        messageElement.appendChild(
                            usernameElement
                        );


                        messageElement.appendChild(
                            textElement
                        );


                        messagesContainer.appendChild(
                            messageElement
                        );
                    }
                );


                /*
                 * If the user was near the bottom,
                 * stay at the bottom.
                 *
                 * Otherwise, keep their position
                 * so they can read old messages.
                 */

                if (wasNearBottom) {

                    messagesContainer.scrollTop =
                        messagesContainer.scrollHeight;

                } else {

                    messagesContainer.scrollTop =
                        oldScrollTop;
                }
            },

            error => {

                console.error(
                    "Live messages error:",
                    error
                );

                showNotification(
                    "Could not update messages."
                );
            }
        );
}


/* =========================
   AUTH STATE
   ========================= */

onAuthStateChanged(
    auth,

    async user => {

        if (!user) {

            currentUserCode = null;

            currentUsername = null;

            currentColor = "#4285F4";

            isAdmin = false;


            if (stopMessageListener) {

                stopMessageListener();

                stopMessageListener = null;
            }


            showScreen("login");

            return;
        }


        try {

            await checkAdminStatus();

        } catch (error) {

            console.error(
                "Auth state error:",
                error
            );
        }
    }
);


/* =========================
   START
   ========================= */

showScreen("login");