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
import config from './config.js';
import database from './config/database.js'
import express, { NextFunction, Request, Response } from 'express'
import cors, { CorsOptions } from 'cors'

// authorization modules
import login from './app/login.js'
import register from './app/register.js'
import auth from './middleware/auth.js'
import isAuth from './app/isAuth.js'
import clerkAdminPermission from './middleware/clerkAdminPermission.js';
import kioskClerkAdminPermission from './middleware/kioskClerkAdminPermission.js';

// Database modules
import partManager from './app/partManager.js'
import userManager from './app/userManager.js';
import sanitize from './middleware/sanitize.js';
import assetManager from './app/assetManager.js'
import path from 'node:path';
import adminPermission from './middleware/adminPermission.js';
import kioskPermission from './middleware/kioskPermission.js';
import { updatePartImage, uploadFile } from './config/uploadFile.js';

const { ROOT_DIRECTORY } = config;
// Create express instance
const app = express();
database();
// SET UP CORS
var whitelist = ['https://www.cameronmckay.xyz', 'https://cameronmckay.xyz', "http://localhost:8080"]
var corsOptions = {
    origin: (origin: string, callback: any) => {
        if (whitelist.indexOf(origin) !== -1) {
            callback(null, true)
        } else {
            callback(new Error('Not allowed by CORS'))
        }
    },
    credentials: true,
} as CorsOptions;

// Add headers to responses
app.use(function(req: Request, res: Response, next: NextFunction) {
    let origin = req.get("origin")!
    if(whitelist.indexOf(origin) !== -1){
        res.header("Access-Control-Allow-Origin", origin);
        res.header("Access-Control-Allow-Credentials", 'true');
    }
    next();
});

// Set up middleware
// JSON middleware...
app.use(express.json());
app.use('/assets', express.static(path.join(config.ROOT_DIRECTORY, 'static/assets')));

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
app.post("/api/part", auth, clerkAdminPermission, sanitize, partManager.createPart);
app.post("/api/part/add", auth, clerkAdminPermission, sanitize, partManager.addToInventory);
app.post("/api/checkout", auth, kioskPermission, sanitize, partManager.checkout);
app.post("/api/checkin", kioskPermission, auth, sanitize, partManager.checkin)
app.post("/api/part/move", auth, sanitize, partManager.movePartRecords);
// Read    throw new TypeError('path must be absolute or specify root to res.sendFile');
app.get("/api/part", auth, sanitize, partManager.getPart);
app.get("/images/parts/:nxid", sanitize, partManager.getPartImage)
app.get("/api/part/id", auth, sanitize, partManager.getPartByID)
app.get("/api/part/search", auth, sanitize, partManager.searchParts);
app.get("/api/part/inventory", auth, sanitize, partManager.getUserInventory);
app.get("/api/part/distinct", auth, sanitize, partManager.getDistinctOnPartInfo);
app.get("/api/part/records", auth, sanitize, partManager.getPartRecordsByID);
app.get("/api/partRecord/history", auth, sanitize, partManager.getPartHistoryByID);
app.get("/api/partRecord/distinct", auth, sanitize, partManager.getDistinctOnPartRecords);
// Update
app.put("/api/part", auth, clerkAdminPermission, sanitize, partManager.updatePartInfo);
app.put("/images/parts", auth, sanitize, clerkAdminPermission, uploadFile, updatePartImage);
// Delete
app.delete("/api/part", auth, clerkAdminPermission, sanitize, partManager.deletePart);


// ***   Users   ***
//
// Create
// app.post("/api/user", auth, permissions, sanitize, userManager.createUser);
// Read
app.get("/api/user", auth, sanitize, userManager.getUser);
app.get("/api/user/all", auth, kioskClerkAdminPermission, userManager.getAllUsers)
app.get('/api/user/inventory', auth, sanitize, partManager.getUserInventory)
// Update
app.put("/api/user", auth, adminPermission, sanitize, userManager.updateUser);
// Delete
app.delete("/api/user", auth, adminPermission, sanitize, userManager.deleteUser);

// ***    Assets    ****
//Create
app.post("/api/asset", auth, sanitize, assetManager.addUntrackedAsset);
// Read
app.get("/api/asset", auth, sanitize, assetManager.getAssets);
app.get("/api/asset/parts", auth, sanitize, assetManager.getPartsOnAsset);
app.get("/api/asset/id", auth, sanitize, assetManager.getAssetByID);
app.get('/api/asset/search', auth, sanitize, assetManager.searchAssets);
app.get('/api/asset/history', auth, sanitize, assetManager.getAssetHistory);
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
// SERVICE WORKER FOR PWA
app.get("/service-worker.js", (req, res) => {
    res.sendFile("./static/service-worker.js", {root: ROOT_DIRECTORY});
});
// MANIFEST FOR SERVICE WORKER
app.get("/manifest.json", (req, res) => {
    res.sendFile("./static/manifest.json", {root: ROOT_DIRECTORY});
});
// ROBOTS FOR LIGHTHOUSE
app.get("/robots.txt", (req, res) => {
    res.sendFile("./static/robots.txt", {root: ROOT_DIRECTORY});
});
// Catch all - hand off routing to front end
app.get('*', async (req, res) => {
    res.sendFile("./static/index.html", {root: ROOT_DIRECTORY});
})

export default app;