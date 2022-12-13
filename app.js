/**
 * @author Cameron McKay
 * 
 * @email cameron@webnx.com
 * 
 * @brief Main application for handling incoming requests
 * 
 * 
 */
// Import npm modules
require("dotenv").config();
const { ROOT_DIRECTORY } = process.env;
require("./config/database").connect();
const express = require("express");
const cors = require("cors");


// authorization modules
const login = require("./app/login");
const register = require("./app/register");
const auth = require("./middleware/auth");
const isAuth = require("./app/isAuth");
const permissions = require("./middleware/permissions");

// Database modules
const partManager = require("./app/partManager");
const userManager = require("./app/userManager");
const sanitize = require("./middleware/sanitize");
const assetManager = require("./app/assetManager");
// Create express instance
const app = express();

// SET UP CORS
var whitelist = ['https://www.cameronmckay.xyz', 'https://cameronmckay.xyz', "http://localhost:8080"]
var corsOptions = {
    origin: (origin, callback) => {
        if (whitelist.indexOf(origin) !== -1) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true,
};

app.use(function(req, res, next) {
    let origin = req.get("origin")
    if(whitelist.indexOf(origin) !== -1){
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", true);
    }
    next();
});

// Set up middleware
// JSON middleware...
app.use(express.json());
app.use(express.static('dist'))

app.options('*', cors(corsOptions))
app.post("/api/auth", auth, isAuth);

// ***   Authentication   ***
//
// Login
app.post("/api/login", sanitize, login);
// Register
app.post("/api/register", sanitize, register);

// ***   Parts   ***
//
// Create
app.post("/api/part", auth, permissions, sanitize, partManager.createPart);
app.post("/api/part/add", auth, permissions, sanitize, partManager.addToInventory);
app.post("/api/checkout", auth, sanitize, partManager.checkout);
app.post("/api/checkin", auth, sanitize, partManager.checkin)
// Read    throw new TypeError('path must be absolute or specify root to res.sendFile');
app.get("/api/part", auth, sanitize, partManager.getPart);
app.get("/api/part/id", auth, sanitize, partManager.getPartByID)
app.get("/api/part/search", auth, sanitize, partManager.searchParts);
app.get("/api/part/inventory", auth, sanitize, partManager.getInventory);
app.get("/api/part/distinct", auth, sanitize, partManager.getDistinctOnPartInfo);
app.get("/api/partRecord/distinct", auth, sanitize, partManager.getDistinctOnPartRecords);
// Update
app.put("/api/part", auth, permissions, sanitize, partManager.updatePartInfo);
// Delete
app.delete("/api/part", auth, permissions, sanitize, partManager.deletePart);


// ***   Users   ***
//
// Create
app.post("/api/user", auth, permissions, sanitize, userManager.createUser);
// Read
app.get("/api/user", auth, sanitize, userManager.getUser);
app.get("/api/user/all", auth, permissions, userManager.getAllUsers)
app.get('/api/user/inventory', auth, sanitize, partManager.getUserInventory)
// Update
app.put("/api/user", auth, permissions, sanitize, userManager.updateUser);
// Delete
app.delete("/api/user", auth, permissions, sanitize, userManager.deleteUser);

// ***    Assets    ****
//Create
app.post("/api/asset", auth, sanitize, assetManager.addUntrackedAsset);
// Read
app.get("/api/asset", auth, sanitize, assetManager.getAssets);
app.get("/api/asset/parts", auth, sanitize, assetManager.getPartsOnAsset);
app.get("/api/asset/id", auth, sanitize, assetManager.getAssetByID);
app.get('/api/asset/search', auth, sanitize, assetManager.searchAssets);
// Update
app.put("/api/asset", auth, sanitize, assetManager.updateAsset);
// Delete
app.delete("/api/asset", auth, sanitize, assetManager.deleteAsset);

// Catch all - BAD REQUEST
app.post("/api/*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});
app.get("/api/*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});
app.put("/api/*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});
app.delete("/api/*", async (req, res) => {
    return res.status(400).send("Invalid request.");
});

app.get('*', async (req, res) => {
    res.sendFile("./dist/index.html", {root: ROOT_DIRECTORY});
})

module.exports = app;