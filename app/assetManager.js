const Asset = require("../model/asset");
const PartRecord = require("../model/partRecord");

const assetManager = {
    addUntrackedAsset: async (req, res) => {
        // Get asset from request
        let { asset } = req.body;
        // Check for required fields
        if (!/WNX([0-9]{7})+/.test(asset.nxid)||!(nxid&&asset_type&&location)) {
            // Send response if request is invalid
            return res.status(400).send("Invalid request");
        }
        // Remove date created if present
        delete asset.date_created;
        // Set by attribute to requesting user
        asset.by = req.user.user_id;
        /**
         * @TODO figure out how to handle parts records when creating assets
         */
        for (const part of asset.parts) {
            PartRecord.create({
                nxid: part,
                building: req.user.building,
                location: asset.nxid,
                by: req.user.user_id,
            })
        }
        // Create a new asset
        Asset.create(asset, (err, asset) => {
            if (err) {
                return res.status(500).send("API could not handle your request: "+err);
            }
            // Return new asset
            res.status(200).json(asset);
        });
    },
    getAssets: async (req, res) => {
        // get object from request
        let { asset } = req.body;
        // Send request to database
        Asset.find(asset, (err, assets) => {
            if (err) {
                // Error
                return res.status(500).send("API could not handle your request: "+err);
            }
            // Return assets to client
            return res.status(200).json(assets);
        });
    },
    getAssetByID: async (req, res) => {
        // Get id from query
        const { id } = req.query
        // Test regex for NXID
        if (!/WNX([0-9]{7})+/.test(asset.nxid)) {
            // Find by NXID
            Asset.findOne({nxid: id}, (err, asset) => {
                if (err) {
                    // Error
                    return res.status(500).send("API could not handle your request: "+err);
                }
                // Return assets to client
                return res.status(200).json(asset);
            });
        }
        // If id is not NXID
        else {
            // Find by mongo ID
            Asset.findById(id, (err, asset) => {
                if (err) {
                    // Error
                    return res.status(500).send("API could not handle your request: "+err);
                }
                // Return assets to client
                return res.status(200).json(asset);
            });
        }
    },
    searchAssets: async (req, res) => {
        // Search data
        // Limit
        // Page number
        const { searchString, pageSize, pageNum } = req.query;
        // Find parts
        // Skip - gets requested page number
        // Limit - returns only enough elements to fill page

        // Splice keywords from search string
        let i = 0
        let keywords = []
        let spliced = false
        while (!spliced) {
            // If end of string
            if (searchString.indexOf(" ", i) == -1) {
                keywords.push(searchString.substring(i, searchString.length))
                spliced = true
            } else {
                // Add spliced keyword to keyword array
                keywords.push(searchString.substring(i, searchString.indexOf(" ", i)))
                i = searchString.indexOf(" ", i) + 1
            }
        }
        // Use keywords to build search options
        let searchOptions = []
        // Add regex of keywords to all search options
        for (const key of keywords) {
            searchOptions.push({ "nxid": { $regex: key, $options: "is" } })
            searchOptions.push({ "manufacturer": { $regex: key, $options: "is" } })
            searchOptions.push({ "asset_type": { $regex: key, $options: "is" } })
            searchOptions.push({ "chassis_type": { $regex: key, $options: "is" } })
            searchOptions.push({ "location": { $regex: key, $options: "is" } })
            searchOptions.push({ "model": { $regex: key, $options: "is" } })
            searchOptions.push({ "serial": { $regex: key, $options: "is" } })
        }
        Asset.aggregate([{ $match: { $or: searchOptions } }])
            .skip(pageSize * (pageNum - 1))
            .limit(Number(pageSize))
            .exec((err, assets) => {
                if (err) {
                    // Database err
                    return res.status(500).send("API could not handle your request: " + err);
                }
                // Send back to client
                return res.status(200).json(assets);
            })
    },
    updateAsset: async (req, res) => {
        let { asset } = req.body;
        // Check for required fields
        if (!/WNX([0-9]{7})+/.test(asset.nxid)||!(nxid&&asset_type&&location)) {
            // Send response if request is invalid
            return res.status(400).send("Invalid request");
        }
        // Remove date created if present
        delete asset.date_created;
        // Set by attribute to requesting user
        asset.by = req.user.user_id;
        // Create a new asset
        /**
         * @TODO figure out how to handle associated parts records
         */
        asset.date_updated = Date.now;
        Asset.findOneAndUpdate(asset, (err, asset) => {
            if (err) {
                return res.status(500).send("API could not handle your request: "+err);
            }
            // Return new asset
            res.status(200).json(asset);
        });
    },
    addParts: async (req, res) => {

    },
    removeParts: async (req, res) => {
        
    },
    deleteAsset: async (req, res) => {

    }
};
module.exports = assetManager;