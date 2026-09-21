import {
    initializeApp
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";

import {
    getFirestore,
    collection,
    query,
    orderBy,
    where,
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import {
    getAuth,
    signInWithEmailAndPassword,
    setPersistence,
    browserLocalPersistence,
    onAuthStateChanged,
    getIdTokenResult,
    signOut
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";


/* =====================================================
   FIREBASE
   ===================================================== */

const firebaseConfig = {
    apiKey: "AIzaSyBAVEXNzez4ySnnq-qJMRM2HiBWIDLoBE",
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

console.log("FIREBASE TEST");
console.log("Project:", auth.app.options.projectId);
console.log("Auth domain:", auth.app.options.authDomain);
console.log("API key loaded:", !!auth.app.options.apiKey);

fetch(
    `https://identitytoolkit.googleapis.com/v1/projects?key=${encodeURIComponent(auth.app.options.apiKey)}`
)
    .then(r => r.json())
    .then(data => console.log("FIREBASE KEY TEST:", data))
    .catch(err => console.error("FIREBASE KEY TEST ERROR:", err));
/* =====================================================
   SERVER
   ===================================================== */

const SERVER_URL =
    "https://coli-verify-1.onrender.com";


/* =====================================================
   ELEMENTS
   ===================================================== */

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


/* =====================================================
   SIDEBAR
   ===================================================== */

const chatTab =
    document.getElementById("chatTab");

const profileTab =
    document.getElementById("profileTab");

const settingsTab =
    document.getElementById("settingsTab");

const chatPage =
    document.getElementById("chatPage");

const profilePage =
    document.getElementById("profilePage");

const settingsPage =
    document.getElementById("settingsPage");

const profileUsername =
    document.getElementById("profileUsername");

const profilePictureInput =
    document.getElementById("profilePictureInput");

const profilePicturePreview =
    document.getElementById("profilePicturePreview");

const profileColor =
    document.getElementById("profileColor");

const profileColorValue =
    document.getElementById("profileColorValue");

const saveProfileButton =
    document.getElementById(
        "saveProfileButton"
    );

const profileMessage =
    document.getElementById(
        "profileMessage"
    );

const logoutButton =
    document.getElementById(
        "logoutButton"
    );


/* =====================================================
   STATE
   ===================================================== */

let currentUserCode = null;

let currentUsername = null;

let currentColor =
    "#4285F4";

let currentProfilePicture =
    null;

let isAdmin = false;

let stopMessageListener =
    null;

let whisperListeners = [];

let canSendMessage = true;

const LOGIN_DURATION =
    4 * 24 * 60 * 60 * 1000;

const LOGIN_TIME_KEY =
    "coliChatLoginTime";

const ACTIVE_CODE_KEY =
    "coliChatActiveCode";


/* =====================================================
   SAFE SERVER JSON
   ===================================================== */

async function getServerResponse(
    response
) {

    const contentType =
        response.headers.get(
            "content-type"
        ) || "";

    if (
        !contentType.includes(
            "application/json"
        )
    ) {

        const text =
            await response.text();

        console.error(
            "Server returned non-JSON response:",
            text
        );

        throw new Error(
            `Server returned ${response.status} instead of JSON.`
        );
    }

    const result =
        await response.json();

    return result;
}


/* =====================================================
   LOCAL USER STORAGE
   ===================================================== */

function getSavedUsers() {

    try {

        return JSON.parse(
            localStorage.getItem(
                "coliChatUsers"
            ) || "{}"
        );

    } catch {

        return {};
    }
}


function saveUser(
    code,
    username,
    color,
    profilePicture = null
) {

    const users =
        getSavedUsers();

    const oldUser =
        users[code] || {};

    users[code] = {
        username,
        color,
        profilePicture:
            profilePicture !== null
                ? profilePicture
                : (
                    oldUser.profilePicture ||
                    null
                )
    };

    localStorage.setItem(
        "coliChatUsers",
        JSON.stringify(users)
    );
}


function getSavedUser(code) {

    const users =
        getSavedUsers();

    return users[code] || null;
}


/* =====================================================
   SCREEN CONTROL
   ===================================================== */

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


/* =====================================================
   PROFILE PICTURE PREVIEW
   ===================================================== */

function updateProfilePicturePreview(url) {

    if (!profilePicturePreview) {
        return;
    }

    profilePicturePreview.innerHTML = "";

    const cleanUrl =
        String(url || "").trim();

    if (!cleanUrl) {

        profilePicturePreview.textContent =
            (currentUsername || "?")
                .charAt(0)
                .toUpperCase();

        return;
    }

    const image =
        document.createElement(
            "img"
        );

    image.src =
        cleanUrl;

    image.alt =
        "Profile picture";

    image.style.width =
        "100%";

    image.style.height =
        "100%";

    image.style.objectFit =
        "cover";

    image.style.display =
        "block";

    image.onerror = () => {

        profilePicturePreview.innerHTML = "";

        profilePicturePreview.textContent =
            (currentUsername || "?")
                .charAt(0)
                .toUpperCase();
    };

    profilePicturePreview.appendChild(
        image
    );
}


/* =====================================================
   PROFILE PICTURE INPUT PREVIEW
   ===================================================== */

profilePictureInput?.addEventListener(
    "input",
    () => {

        updateProfilePicturePreview(
            profilePictureInput.value
        );
    }
);


/* =====================================================
   PAGE SWITCHING
   ===================================================== */

function switchPage(pageName) {

    if (
        !chatPage ||
        !profilePage ||
        !settingsPage
    ) {
        return;
    }

    const pages = [
        chatPage,
        profilePage,
        settingsPage
    ];

    const tabs = [
        chatTab,
        profileTab,
        settingsTab
    ];

    pages.forEach(
        page => {

            page.classList.remove(
                "activePage"
            );
        }
    );

    tabs.forEach(
        tab => {

            if (tab) {

                tab.classList.remove(
                    "active"
                );
            }
        }
    );

    if (pageName === "chat") {

        chatPage.classList.add(
            "activePage"
        );

        chatTab?.classList.add(
            "active"
        );

        return;
    }

    if (pageName === "profile") {

        profilePage.classList.add(
            "activePage"
        );

        profileTab?.classList.add(
            "active"
        );

        updateProfilePage();

        return;
    }

    if (pageName === "settings") {

        settingsPage.classList.add(
            "activePage"
        );

        settingsTab?.classList.add(
            "active"
        );
    }
}


/* =====================================================
   SIDEBAR BUTTONS
   ===================================================== */

chatTab?.addEventListener(
    "click",
    () => switchPage("chat")
);

profileTab?.addEventListener(
    "click",
    () => switchPage("profile")
);

settingsTab?.addEventListener(
    "click",
    () => switchPage("settings")
);


/* =====================================================
   PROFILE NAME CODE UI
   ===================================================== */

let profileNameCodeInput = null;


function setupProfileNameCodeUI() {

    if (
        !profilePage ||
        profileNameCodeInput
    ) {
        return;
    }

    if (profileUsername) {

        profileUsername.readOnly =
            false;

        profileUsername.style.cursor =
            "text";
    }

    const wrapper =
        document.createElement(
            "div"
        );

    wrapper.style.marginTop =
        "12px";

    const label =
        document.createElement(
            "label"
        );

    label.textContent =
        "Name-change code";

    label.style.display =
        "block";

    label.style.marginBottom =
        "6px";

    label.style.fontWeight =
        "600";

    profileNameCodeInput =
        document.createElement(
            "input"
        );

    profileNameCodeInput.type =
        "text";

    profileNameCodeInput.placeholder =
        "Enter the one-time code";

    profileNameCodeInput.maxLength =
        8;

    profileNameCodeInput.autocomplete =
        "off";

    profileNameCodeInput.style.width =
        "100%";

    profileNameCodeInput.style.boxSizing =
        "border-box";

    wrapper.appendChild(
        label
    );

    wrapper.appendChild(
        profileNameCodeInput
    );

    if (saveProfileButton) {

        saveProfileButton.parentNode.insertBefore(
            wrapper,
            saveProfileButton
        );

    } else {

        profilePage.appendChild(
            wrapper
        );
    }
}


setupProfileNameCodeUI();


/* =====================================================
   PROFILE PAGE
   ===================================================== */

function updateProfilePage() {

    setupProfileNameCodeUI();

    if (profileUsername) {

        profileUsername.value =
            currentUsername || "";
    }

    if (profilePictureInput) {

        profilePictureInput.value =
            currentProfilePicture || "";
    }

    if (profileColor) {

        profileColor.value =
            currentColor ||
            "#4285F4";
    }

    if (profileNameCodeInput) {

        profileNameCodeInput.value =
            "";
    }

    updateProfilePicturePreview(
        currentProfilePicture
    );

    updateProfileColorText();

    if (profileMessage) {

        profileMessage.textContent =
            "";
    }
}


function updateProfileColorText() {

    if (!profileColorValue) {
        return;
    }

    profileColorValue.textContent =
        profileColor?.value ||
        currentColor ||
        "#4285F4";
}


profileColor?.addEventListener(
    "input",
    updateProfileColorText
);


/* =====================================================
   SAVE PROFILE PICTURE
   ===================================================== */

async function saveProfilePicture(url) {

    const cleanUrl =
        String(url || "").trim();

    if (
        cleanUrl &&
        !cleanUrl.startsWith(
            "https://"
        )
    ) {

        throw new Error(
            "Profile picture must use an HTTPS URL."
        );
    }

    if (cleanUrl.length > 1000) {

        throw new Error(
            "Profile picture URL is too long."
        );
    }

    if (cleanUrl) {

        try {

            const parsedUrl =
                new URL(cleanUrl);

            if (
                parsedUrl.protocol !==
                "https:"
            ) {

                throw new Error(
                    "Profile picture must use an HTTPS URL."
                );
            }

        } catch (error) {

            if (
                error.message ===
                "Profile picture must use an HTTPS URL."
            ) {
                throw error;
            }

            throw new Error(
                "Enter a valid HTTPS image URL."
            );
        }
    }

    const token =
        await getAuthToken();

    const response =
        await fetch(
            `${SERVER_URL}/profile-picture`,
            {
                method:
                    "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Bearer ${token}`
                },

                body:
                    JSON.stringify({
                        profilePicture:
                            cleanUrl
                    })
            }
        );

    const result =
        await getServerResponse(
            response
        );

    if (
        !response.ok ||
        !result.success
    ) {

        throw new Error(
            result.message ||
            "Could not save profile picture."
        );
    }

    currentProfilePicture =
        result.profilePicture ||
        null;

    updateProfilePicturePreview(
        currentProfilePicture
    );

    return currentProfilePicture;
}


/* =====================================================
   SAVE PROFILE
   ===================================================== */

if (saveProfileButton) {

    saveProfileButton.addEventListener(
        "click",
        async () => {

            const username =
                String(
                    profileUsername?.value ||
                    ""
                ).trim();

            const color =
                profileColor?.value ||
                "#4285F4";

            const profilePicture =
                String(
                    profilePictureInput?.value ||
                    ""
                ).trim();

            const nameCode =
                String(
                    profileNameCodeInput?.value ||
                    ""
                ).trim();


            if (!username) {

                if (profileMessage) {

                    profileMessage.textContent =
                        "Enter a username.";

                    profileMessage.style.color =
                        "#d93025";
                }

                return;
            }


            if (username.length > 30) {

                if (profileMessage) {

                    profileMessage.textContent =
                        "Username must be 30 characters or less.";

                    profileMessage.style.color =
                        "#d93025";
                }

                return;
            }


            if (
                profilePicture &&
                !profilePicture.startsWith(
                    "https://"
                )
            ) {

                if (profileMessage) {

                    profileMessage.textContent =
                        "Profile picture must use an HTTPS URL.";

                    profileMessage.style.color =
                        "#d93025";
                }

                return;
            }


            try {

                saveProfileButton.disabled =
                    true;


                if (
                    username !==
                    currentUsername
                ) {

                    if (!nameCode) {

                        if (profileMessage) {

                            profileMessage.textContent =
                                "A one-time name-change code is required.";

                            profileMessage.style.color =
                                "#d93025";
                        }

                        return;
                    }

                    const token =
                        await getAuthToken();

                    const response =
                        await fetch(
                            `${SERVER_URL}/change-username`,
                            {
                                method:
                                    "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json",

                                    "Authorization":
                                        `Bearer ${token}`
                                },

                                body:
                                    JSON.stringify({
                                        username,
                                        code:
                                            nameCode
                                    })
                            }
                        );

                    const result =
                        await getServerResponse(
                            response
                        );

                    if (
                        !response.ok ||
                        !result.success
                    ) {

                        throw new Error(
                            result.message ||
                            "Could not change username."
                        );
                    }

                    currentUsername =
                        result.username;

                    if (profileNameCodeInput) {

                        profileNameCodeInput.value =
                            "";
                    }
                }


                await saveProfilePicture(
                    profilePicture
                );


                currentColor =
                    color;

                if (colorInput) {

                    colorInput.value =
                        currentColor;
                }


                if (currentUserCode) {

                    saveUser(
                        currentUserCode,
                        currentUsername,
                        currentColor,
                        currentProfilePicture
                    );
                }


                updateProfilePicturePreview(
                    currentProfilePicture
                );

                if (profileMessage) {

                    profileMessage.textContent =
                        "Profile saved successfully.";

                    profileMessage.style.color =
                        "#4285F4";
                }

                showNotification(
                    "Profile updated."
                );

            } catch (error) {

                console.error(
                    "Profile save error:",
                    error
                );

                if (profileMessage) {

                    profileMessage.textContent =
                        error.message ||
                        "Could not save profile.";

                    profileMessage.style.color =
                        "#d93025";
                }

            } finally {

                saveProfileButton.disabled =
                    false;
            }
        }
    );
}


/* =====================================================
   NOTIFICATIONS
   ===================================================== */

function showNotification(message) {

    const notification =
        document.createElement(
            "div"
        );

    notification.textContent =
        message;

    notification.style.position =
        "fixed";

    notification.style.bottom =
        "25px";

    notification.style.left =
        "50%";

    notification.style.transform =
        "translateX(-50%)";

    notification.style.background =
        "#222";

    notification.style.color =
        "white";

    notification.style.padding =
        "12px 20px";

    notification.style.borderRadius =
        "10px";

    notification.style.fontSize =
        "14px";

    notification.style.zIndex =
        "99999";

    notification.style.maxWidth =
        "90%";

    notification.style.textAlign =
        "center";

    document.body.appendChild(
        notification
    );

    setTimeout(
        () => {

            notification.remove();

        },
        3000
    );
}


/* =====================================================
   ADMIN CHECK
   ===================================================== */

async function checkAdminStatus() {

    try {

        const user =
            auth.currentUser;

        if (!user) {

            isAdmin =
                false;

            return false;
        }

        /*
         * Do NOT force a token refresh here.
         * The token obtained during sign-in already
         * contains the current custom claims.
         */

        const tokenResult =
            await getIdTokenResult(
                user
            );

        isAdmin =
            tokenResult.claims.admin === true;

        return isAdmin;

    } catch (error) {

        console.error(
            "Admin check error:",
            error
        );

        isAdmin =
            false;

        return false;
    }
}


/* =====================================================
   LOAD SERVER PROFILE
   ===================================================== */

async function loadServerProfile() {

    try {

        const token =
            await getAuthToken();

        const response =
            await fetch(
                `${SERVER_URL}/profile`,
                {
                    method:
                        "GET",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );

        const result =
            await getServerResponse(
                response
            );

        if (
            result.success &&
            result.username
        ) {

            currentUsername =
                result.username;

            currentProfilePicture =
                result.profilePicture ||
                null;

            if (currentUserCode) {

                const savedUser =
                    getSavedUser(
                        currentUserCode
                    );

                saveUser(
                    currentUserCode,
                    currentUsername,
                    savedUser?.color ||
                        currentColor,
                    currentProfilePicture
                );
            }

            return true;
        }

        if (
            response.status === 401 ||
            response.status === 403
        ) {

            throw new Error(
                "Your login session is no longer valid."
            );
        }

        return false;

    } catch (error) {

        console.error(
            "Load profile error:",
            error
        );

        return false;
    }
}


/* =====================================================
   SET INITIAL USERNAME
   ===================================================== */

async function setInitialUsername(
    username
) {

    const token =
        await getAuthToken();

    const response =
        await fetch(
            `${SERVER_URL}/set-username`,
            {
                method:
                    "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Bearer ${token}`
                },

                body:
                    JSON.stringify({
                        username
                    })
            }
        );

    const result =
        await getServerResponse(
            response
        );

    if (
        !response.ok ||
        !result.success
    ) {

        throw new Error(
            result.message ||
            "Could not save username."
        );
    }

    return result.username;
}


/* =====================================================
   JOIN CHAT
   ===================================================== */

joinButton?.addEventListener(
    "click",
    async () => {

        const code =
            String(
                codeInput?.value ||
                ""
            ).trim();

        if (!code) {

            if (errorMessage) {

                errorMessage.textContent =
                    "Enter a code.";
            }

            return;
        }

        joinButton.disabled =
            true;

        if (errorMessage) {

            errorMessage.textContent =
                "Checking code.";
        }

        try {

            const response =
                await fetch(
                    `${SERVER_URL}/verify-code`,
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({
                                code
                            })
                    }
                );

            const result =
                await getServerResponse(
                    response
                );

            if (!response.ok) {

                throw new Error(
                    result.message ||
                    `Verification server returned ${response.status}`
                );
            }

            if (!result.success) {

                if (errorMessage) {

                    errorMessage.textContent =
                        result.message ||
                        "Invalid code.";
                }

                return;
            }

            await setPersistence(
                auth,
                browserLocalPersistence
            );

            localStorage.setItem(
                LOGIN_TIME_KEY,
                Date.now().toString()
            );

            localStorage.setItem(
                ACTIVE_CODE_KEY,
                code
            );

            await signInWithEmailAndPassword(
                auth,
                result.email,
                result.password
            );

            await checkAdminStatus();

            currentUserCode =
                code;

            const hasServerProfile =
                await loadServerProfile();

            if (hasServerProfile) {

                const savedUser =
                    getSavedUser(code);

                if (savedUser) {

                    currentColor =
                        savedUser.color ||
                        "#4285F4";
                } else {

                    currentColor =
                        "#4285F4";
                }

                if (colorInput) {

                    colorInput.value =
                        currentColor;
                }

                showScreen("chat");

                switchPage("chat");

                loadMessages();

                loadWhispers();

            } else {

                currentProfilePicture =
                    null;

                showScreen(
                    "username"
                );

                if (usernameInput) {

                    usernameInput.value =
                        "";

                    usernameInput.focus();
                }
            }

        } catch (error) {

            localStorage.removeItem(
                LOGIN_TIME_KEY
            );

            localStorage.removeItem(
                ACTIVE_CODE_KEY
            );

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
                        "Cannot connect to verification server.";

                } else {

                    errorMessage.textContent =
                        error.message ||
                        "Could not connect to verification server.";
                }
            }

        } finally {

            joinButton.disabled =
                false;
        }
    }
);


/* =====================================================
   ENTER ACCESS CODE
   ===================================================== */

codeInput?.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Enter"
        ) {

            joinButton?.click();
        }
    }
);


/* =====================================================
   INITIAL USERNAME
   ===================================================== */

usernameButton?.addEventListener(
    "click",
    async () => {

        const username =
            String(
                usernameInput?.value ||
                ""
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

        usernameButton.disabled =
            true;

        if (usernameError) {

            usernameError.textContent =
                "";
        }

        try {

            const savedUsername =
                await setInitialUsername(
                    username
                );

            currentUsername =
                savedUsername;

            currentProfilePicture =
                null;

            currentColor =
                colorInput?.value ||
                "#4285F4";

            saveUser(
                currentUserCode,
                currentUsername,
                currentColor,
                currentProfilePicture
            );

            showScreen("chat");

            switchPage("chat");

            loadMessages();

            loadWhispers();

        } catch (error) {

            console.error(
                "Initial username error:",
                error
            );

            if (usernameError) {

                usernameError.textContent =
                    error.message ||
                    "Could not save username.";
            }

        } finally {

            usernameButton.disabled =
                false;
        }
    }
);


/* =====================================================
   ENTER USERNAME
   ===================================================== */

usernameInput?.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Enter"
        ) {

            usernameButton?.click();
        }
    }
);


/* =====================================================
   COLOR
   ===================================================== */

colorInput?.addEventListener(
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
                currentColor,
                currentProfilePicture
            );
        }

        updateProfileColorText();
    }
);


/* =====================================================
   AUTH TOKEN
   ===================================================== */

async function getAuthToken() {

    const user =
        auth.currentUser;

    if (!user) {

        throw new Error(
            "You are not signed in."
        );
    }

    /*
     * Do NOT force a token refresh here.
     * Firebase will reuse the current valid token.
     */

    return await user.getIdToken();
}


/* =====================================================
   RANDOM ACCESS CODE
   ===================================================== */

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
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );

        const result =
            await getServerResponse(
                response
            );

        if (
            !response.ok ||
            !result.success
        ) {

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


/* =====================================================
   RANDOM NAME-CHANGE CODE
   ===================================================== */

async function generateRandomNameCode() {

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
                `${SERVER_URL}/random-name-code`,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${token}`
                    }
                }
            );

        const result =
            await getServerResponse(
                response
            );

        if (
            !response.ok ||
            !result.success
        ) {

            throw new Error(
                result.message ||
                "Could not generate name-change code."
            );
        }

        showNotification(
            `Name-change code: ${result.code} (expires in 15 minutes)`
        );

        console.log(
            "Generated name-change code:",
            result.code
        );

    } catch (error) {

        console.error(
            "Random name code error:",
            error
        );

        showNotification(
            error.message ||
            "Could not generate name-change code."
        );
    }
}


/* =====================================================
   COMMANDS
   ===================================================== */

function showCommands() {

    if (isAdmin) {

        showNotification(
            "Commands: /commands, /random_code, /random_name_code, /whisper <username> <message>, /mute <username>, /unmute <username>, /clear"
        );

    } else {

        showNotification(
            "Commands: /commands, /whisper <username> <message>"
        );
    }
}


/* =====================================================
   MUTE
   ===================================================== */

async function muteChat(
    username
) {

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
                    method:
                        "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            username
                        })
                }
            );

        const result =
            await getServerResponse(
                response
            );

        if (
            !response.ok ||
            !result.success
        ) {

            throw new Error(
                result.message ||
                "Could not mute chat."
            );
        }

        showNotification(
            "Chat muted."
        );

    } catch (error) {

        console.error(
            "Mute error:",
            error
        );

        showNotification(
            error.message ||
            "Could not mute chat."
        );
    }
}


/* =====================================================
   UNMUTE
   ===================================================== */

async function unmuteChat(
    username
) {

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
                    method:
                        "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            username
                        })
                }
            );

        const result =
            await getServerResponse(
                response
            );

        if (
            !response.ok ||
            !result.success
        ) {

            throw new Error(
                result.message ||
                "Could not unmute chat."
            );
        }

        showNotification(
            "Chat unmuted."
        );

    } catch (error) {

        console.error(
            "Unmute error:",
            error
        );

        showNotification(
            error.message ||
            "Could not unmute chat."
        );
    }
}


/* =====================================================
   CLEAR CHAT
   ===================================================== */

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
                    method:
                        "POST",

                    headers: {
                        "Authorization":
                            `Bearer ${token}`,

                        "Content-Type":
                            "application/json"
                    }
                }
            );

        const result =
            await getServerResponse(
                response
            );

        if (
            !response.ok ||
            !result.success
        ) {

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


/* =====================================================
   SEND WHISPER
   ===================================================== */

async function sendWhisper(
    targetUsername,
    text
) {

    if (!currentUsername) {

        showNotification(
            "Set your username first."
        );

        return;
    }

    if (!targetUsername) {

        showNotification(
            "Usage: /whisper <username> <message>"
        );

        return;
    }

    if (!text) {

        showNotification(
            "Usage: /whisper <username> <message>"
        );

        return;
    }

    try {

        const token =
            await getAuthToken();

        const response =
            await fetch(
                `${SERVER_URL}/send-whisper`,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${token}`
                    },

                    body:
                        JSON.stringify({
                            username:
                                targetUsername,

                            text,

                            color:
                                currentColor
                        })
                }
            );

        const result =
            await getServerResponse(
                response
            );

        if (
            !response.ok ||
            !result.success
        ) {

            throw new Error(
                result.message ||
                "Could not send whisper."
            );
        }

        showNotification(
            `Whisper sent to ${targetUsername}.`
        );

    } catch (error) {

        console.error(
            "Whisper error:",
            error
        );

        showNotification(
            error.message ||
            "Could not send whisper."
        );
    }
}


/* =====================================================
   SEND MESSAGE
   ===================================================== */

async function sendMessage() {

    const text =
        String(
            messageInput?.value ||
            ""
        ).trim();

    if (!text) {
        return;
    }

    if (!canSendMessage) {

        showNotification(
            "Stop spamming."
        );

        return;
    }

    canSendMessage =
        false;

    setTimeout(
        () => {

            canSendMessage =
                true;

        },
        1000
    );


    if (
        text ===
        "/commands"
    ) {

        messageInput.value =
            "";

        showCommands();

        return;
    }


    if (
        text ===
        "/random_code"
    ) {

        messageInput.value =
            "";

        await generateRandomCode();

        return;
    }


    if (
        text ===
        "/random_name_code"
    ) {

        messageInput.value =
            "";

        await generateRandomNameCode();

        return;
    }


    if (
        text.startsWith(
            "/whisper "
        )
    ) {

        const whisperContent =
            text
                .substring(9)
                .trim();

        const firstSpace =
            whisperContent.indexOf(
                " "
            );

        if (firstSpace === -1) {

            messageInput.value =
                "";

            showNotification(
                "Usage: /whisper <username> <message>"
            );

            return;
        }

        let targetUsername =
            whisperContent
                .substring(
                    0,
                    firstSpace
                )
                .trim();

        const whisperText =
            whisperContent
                .substring(
                    firstSpace + 1
                )
                .trim();

        targetUsername =
            targetUsername.replace(
                /_/g,
                " "
            );

        messageInput.value =
            "";

        await sendWhisper(
            targetUsername,
            whisperText
        );

        return;
    }


    if (
        text.startsWith(
            "/mute "
        ) &&
        text.length > 6
    ) {

        const username =
            text
                .substring(6)
                .trim();

        messageInput.value =
            "";

        await muteChat(
            username
        );

        return;
    }


    if (
        text.startsWith(
            "/unmute "
        ) &&
        text.length > 8
    ) {

        const username =
            text
                .substring(8)
                .trim();

        messageInput.value =
            "";

        await unmuteChat(
            username
        );

        return;
    }


    if (
        text ===
        "/mute"
    ) {

        messageInput.value =
            "";

        showNotification(
            "Usage: /mute <username>"
        );

        return;
    }


    if (
        text ===
        "/unmute"
    ) {

        messageInput.value =
            "";

        showNotification(
            "Usage: /unmute <username>"
        );

        return;
    }


    if (
        text ===
        "/clear"
    ) {

        messageInput.value =
            "";

        await clearChat();

        return;
    }


    if (!currentUsername) {

        showNotification(
            "Set your username first."
        );

        return;
    }

    try {

        sendButton.disabled =
            true;

        const token =
            await getAuthToken();

        const response =
            await fetch(
                `${SERVER_URL}/send-message`,
                {
                    method:
                        "POST",

                    headers: {
                        "Content-Type":
                            "application/json",

                        "Authorization":
                            `Bearer ${token}`
                    },

                    body:
                        JSON.stringify({
                            text,

                            color:
                                currentColor
                        })
                }
            );

        const result =
            await getServerResponse(
                response
            );

        if (
            !response.ok ||
            !result.success
        ) {

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

        messageInput.value =
            "";

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

        sendButton.disabled =
            false;
    }
}


/* =====================================================
   SEND BUTTON
   ===================================================== */

sendButton?.addEventListener(
    "click",
    sendMessage
);


/* =====================================================
   ENTER TO SEND
   ===================================================== */

messageInput?.addEventListener(
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


/* =====================================================
   CREATE AVATAR
   ===================================================== */

function createAvatar(
    profilePicture,
    username,
    color
) {

    const avatar =
        document.createElement(
            "div"
        );

    avatar.style.width =
        "36px";

    avatar.style.height =
        "36px";

    avatar.style.minWidth =
        "36px";

    avatar.style.borderRadius =
        "50%";

    avatar.style.overflow =
        "hidden";

    avatar.style.display =
        "flex";

    avatar.style.alignItems =
        "center";

    avatar.style.justifyContent =
        "center";

    avatar.style.background =
        color ||
        "#4285F4";

    avatar.style.color =
        "white";

    avatar.style.fontWeight =
        "600";

    avatar.style.fontSize =
        "16px";

    avatar.style.userSelect =
        "none";

    const cleanPicture =
        String(
            profilePicture || ""
        ).trim();

    if (cleanPicture) {

        const image =
            document.createElement(
                "img"
            );

        image.src =
            cleanPicture;

        image.alt =
            username ||
            "Profile picture";

        image.style.width =
            "100%";

        image.style.height =
            "100%";

        image.style.objectFit =
            "cover";

        image.style.display =
            "block";

        image.onerror = () => {

            image.remove();

            avatar.textContent =
                (username || "?")
                    .charAt(0)
                    .toUpperCase();
        };

        avatar.appendChild(
            image
        );

    } else {

        avatar.textContent =
            (username || "?")
                .charAt(0)
                .toUpperCase();
    }

    return avatar;
}


/* =====================================================
   LIVE PUBLIC MESSAGES
   ===================================================== */

function loadMessages() {

    if (!messagesContainer) {
        return;
    }

    if (stopMessageListener) {

        stopMessageListener();

        stopMessageListener =
            null;
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

                const wasNearBottom =
                    messagesContainer.scrollHeight -
                    messagesContainer.scrollTop -
                    messagesContainer.clientHeight <
                    100;

                const oldScrollTop =
                    messagesContainer.scrollTop;

                messagesContainer
                    .querySelectorAll(
                        ".publicMessage"
                    )
                    .forEach(
                        element =>
                            element.remove()
                    );

                snapshot.forEach(
                    doc => {

                        const data =
                            doc.data();

                        const messageElement =
                            document.createElement(
                                "div"
                            );

                        messageElement.className =
                            "message publicMessage";

                        messageElement.style.display =
                            "flex";

                        messageElement.style.alignItems =
                            "flex-start";

                        messageElement.style.gap =
                            "10px";


                        const avatar =
                            createAvatar(
                                data.profilePicture,
                                data.username ||
                                    "Unknown",
                                data.color ||
                                    "#4285F4"
                            );

                        messageElement.appendChild(
                            avatar
                        );


                        const content =
                            document.createElement(
                                "div"
                            );

                        content.style.minWidth =
                            "0";


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


                        content.appendChild(
                            usernameElement
                        );

                        content.appendChild(
                            textElement
                        );

                        messageElement.appendChild(
                            content
                        );

                        messagesContainer.appendChild(
                            messageElement
                        );
                    }
                );

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


/* =====================================================
   STOP WHISPER LISTENERS
   ===================================================== */

function stopWhisperListeners() {

    whisperListeners.forEach(
        unsubscribe => {

            try {

                unsubscribe();

            } catch {

                // Ignore unsubscribe errors
            }
        }
    );

    whisperListeners = [];
}


/* =====================================================
   LIVE WHISPERS
   ===================================================== */

function loadWhispers() {

    const user =
        auth.currentUser;

    if (
        !user ||
        !messagesContainer
    ) {
        return;
    }

    stopWhisperListeners();

    const whispers =
        new Map();


    function renderWhispers() {

        document
            .querySelectorAll(
                ".whisperMessage"
            )
            .forEach(
                element =>
                    element.remove()
            );

        const sortedWhispers =
            Array.from(
                whispers.values()
            ).sort(
                (a, b) =>
                    (a.timestamp || 0) -
                    (b.timestamp || 0)
            );

        sortedWhispers.forEach(
            whisper => {

                const element =
                    document.createElement(
                        "div"
                    );

                element.className =
                    "message whisperMessage";

                element.style.display =
                    "flex";

                element.style.alignItems =
                    "flex-start";

                element.style.gap =
                    "10px";


                const isSender =
                    whisper.senderUid ===
                    user.uid;


                const avatarUsername =
                    isSender
                        ? (
                            whisper.senderUsername ||
                            currentUsername ||
                            "Unknown"
                        )
                        : (
                            whisper.senderUsername ||
                            "Unknown"
                        );


                const avatarPicture =
                    isSender
                        ? (
                            whisper.senderProfilePicture ||
                            currentProfilePicture
                        )
                        : (
                            whisper.senderProfilePicture ||
                            null
                        );


                const avatar =
                    createAvatar(
                        avatarPicture,
                        avatarUsername,
                        whisper.color ||
                            "#4285F4"
                    );

                element.appendChild(
                    avatar
                );


                const content =
                    document.createElement(
                        "div"
                    );

                content.style.minWidth =
                    "0";


                const label =
                    document.createElement(
                        "strong"
                    );


                if (isSender) {

                    label.textContent =
                        `Whisper to ${whisper.recipientUsername}: `;

                } else {

                    label.textContent =
                        `Whisper from ${whisper.senderUsername}: `;
                }


                label.style.color =
                    whisper.color ||
                    "#4285F4";


                const text =
                    document.createElement(
                        "span"
                    );

                text.textContent =
                    whisper.text ||
                    "";


                content.appendChild(
                    label
                );

                content.appendChild(
                    text
                );

                element.appendChild(
                    content
                );

                messagesContainer.appendChild(
                    element
                );
            }
        );
    }


    const sentQuery =
        query(
            collection(
                db,
                "whispers"
            ),

            where(
                "senderUid",
                "==",
                user.uid
            ),

            orderBy(
                "timestamp",
                "asc"
            )
        );


    const receivedQuery =
        query(
            collection(
                db,
                "whispers"
            ),

            where(
                "recipientUid",
                "==",
                user.uid
            ),

            orderBy(
                "timestamp",
                "asc"
            )
        );


    const unsubscribeSent =
        onSnapshot(
            sentQuery,

            snapshot => {

                snapshot.docChanges()
                    .forEach(
                        change => {

                            if (
                                change.type ===
                                "removed"
                            ) {

                                whispers.delete(
                                    change.doc.id
                                );

                            } else {

                                whispers.set(
                                    change.doc.id,
                                    {
                                        id:
                                            change.doc.id,

                                        ...change.doc.data()
                                    }
                                );
                            }
                        }
                    );

                renderWhispers();
            },

            error => {

                console.error(
                    "Sent whispers error:",
                    error
                );
            }
        );


    const unsubscribeReceived =
        onSnapshot(
            receivedQuery,

            snapshot => {

                snapshot.docChanges()
                    .forEach(
                        change => {

                            if (
                                change.type ===
                                "removed"
                            ) {

                                whispers.delete(
                                    change.doc.id
                                );

                            } else {

                                whispers.set(
                                    change.doc.id,
                                    {
                                        id:
                                            change.doc.id,

                                        ...change.doc.data()
                                    }
                                );
                            }
                        }
                    );

                renderWhispers();
            },

            error => {

                console.error(
                    "Received whispers error:",
                    error
                );
            }
        );


    whisperListeners.push(
        unsubscribeSent
    );

    whisperListeners.push(
        unsubscribeReceived
    );
}


/* =====================================================
   LOGOUT
   ===================================================== */

logoutButton?.addEventListener(
    "click",
    async () => {

        try {

            if (stopMessageListener) {

                stopMessageListener();

                stopMessageListener =
                    null;
            }

            stopWhisperListeners();

            localStorage.removeItem(
                LOGIN_TIME_KEY
            );

            localStorage.removeItem(
                ACTIVE_CODE_KEY
            );

            await signOut(auth);

            currentUserCode =
                null;

            currentUsername =
                null;

            currentColor =
                "#4285F4";

            currentProfilePicture =
                null;

            isAdmin =
                false;

            showScreen("login");

            if (codeInput) {

                codeInput.value =
                    "";
            }

            if (errorMessage) {

                errorMessage.textContent =
                    "";
            }

            showNotification(
                "You have been logged out."
            );

        } catch (error) {

            console.error(
                "Logout error:",
                error
            );

            showNotification(
                "Could not log out."
            );
        }
    }
);


/* =====================================================
   AUTH STATE
   ===================================================== */

onAuthStateChanged(
    auth,
    async user => {

        if (!user) {

            currentUserCode =
                null;

            currentUsername =
                null;

            currentColor =
                "#4285F4";

            currentProfilePicture =
                null;

            isAdmin =
                false;

            if (stopMessageListener) {

                stopMessageListener();

                stopMessageListener =
                    null;
            }

            stopWhisperListeners();

            showScreen("login");

            return;
        }

        try {

            const loginTime =
                Number(
                    localStorage.getItem(
                        LOGIN_TIME_KEY
                    ) || 0
                );

            const savedCode =
                localStorage.getItem(
                    ACTIVE_CODE_KEY
                );

            if (
                !loginTime ||
                Date.now() -
                    loginTime >=
                    LOGIN_DURATION ||
                !savedCode
            ) {

                localStorage.removeItem(
                    LOGIN_TIME_KEY
                );

                localStorage.removeItem(
                    ACTIVE_CODE_KEY
                );

                await signOut(auth);

                showScreen(
                    "login"
                );

                return;
            }

            currentUserCode =
                savedCode;

            await checkAdminStatus();

            const hasServerProfile =
                await loadServerProfile();

            if (hasServerProfile) {

                const savedUser =
                    getSavedUser(
                        savedCode
                    );

                if (savedUser) {

                    currentColor =
                        savedUser.color ||
                        "#4285F4";
                }

                if (colorInput) {

                    colorInput.value =
                        currentColor;
                }

                showScreen("chat");

                switchPage("chat");

                loadMessages();

                loadWhispers();

            } else {

                currentProfilePicture =
                    null;

                showScreen(
                    "username"
                );

                if (usernameInput) {

                    usernameInput.value =
                        "";

                    usernameInput.focus();
                }
            }

        } catch (error) {

            console.error(
                "Auth state error:",
                error
            );

            showScreen(
                "login"
            );
        }
    }
);


/* =====================================================
   START
   ===================================================== */

showScreen("login");

switchPage("chat");