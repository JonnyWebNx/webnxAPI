import request from 'supertest'
import config from "../config"
import { jest } from '@jest/globals'
import { AssetSchema, CartItem } from "../interfaces"
const { TECH_TOKEN, KIOSK_TOKEN, INVENTORY_TOKEN, ADMIN_TOKEN } = config
const ASSET_TAG = "WNX0017884"
// const ASSET_MONGO_ID = "63a3701b9d12bfd7c59e4854"
const EMPTY_TEXT_SEARCH_QUERY_STRING = "?searchString=&pageNum=1&pageSize=50"
const TEXT_SEARCH_QUERY_STRING = "?searchString=wnx&pageNum=1&pageSize=50"
const TEXT_SEARCH_QUERY_STRING_NO_RESULTS = "?searchString=afanepfiasfkacaeipas&pageNum=1&pageSize=50"
const ADVANCED_SEARCH_QUERY_STRING = "?asset_type=Server&advanced=true&pageNum=1&pageSize=50"
const TEST_ASSET = {
    asset_tag: "",
    building: 3,
    asset_type: "Server",
    chassis_type: "Rack",
    manufacturer: "Supermicro",
    model: "CSE-826",
    serial: "8422681354",
    rails: true,
    live: false,
    bay: 3,
}
const INCOMPLETE_ASSET = {
    asset_tag: "",
    rails: true,
    live: false,
    bay: 3,
}
const PARTS_LIST = [
    { nxid: "PNX0000001", quantity: 2} as CartItem,
    { nxid: "PNX0000003", quantity: 4} as CartItem,
    { nxid: "PNX0000004", quantity: 1} as CartItem,
    { nxid: "PNX0000008", quantity: 1} as CartItem,
]

function generateAsset() {
    let tempAsset = JSON.parse(JSON.stringify(TEST_ASSET))
    let num = Math.floor(1000000 + Math.random() * 9000000)
    tempAsset.asset_tag = `WNX${num}`
    return tempAsset as AssetSchema;
}
function generateIncompleteAsset() {
    let tempAsset = JSON.parse(JSON.stringify(INCOMPLETE_ASSET))
    let num = Math.floor(1000000 + Math.random() * 9000000)
    tempAsset.asset_tag = `WNX${num}`
    return tempAsset as AssetSchema;
}

function wait(ms: number) {
    return new Promise<void>((res)=>{
        setTimeout(res, ms)
    })
}

function partsListsMatch(reqList: CartItem[], resList: CartItem[]) {
    let tempReqList = JSON.parse(JSON.stringify(reqList)) as CartItem[]
    let tempResList = JSON.parse(JSON.stringify(resList)) as CartItem[]
    tempReqList = tempReqList.sort((e, i) => {
        if(e.nxid > i.nxid )
            return 1
        if(e.nxid < i.nxid)
            return -1
        return 0
    })
    tempResList = tempResList.sort((e, i) => {
        if(e.nxid > i.nxid )
            return 1
        if(e.nxid < i.nxid)
            return -1
        return 0
    })
    return (JSON.stringify(tempReqList)==JSON.stringify(tempResList))||(tempReqList.length==0&&tempResList.length==0)
}

function assertSuccessfulAssetSearchWithResults(res: request.Response) {
    expect(res.status).toBe(200)
    expect(res.body.numPages).toBeGreaterThan(0)
    expect(res.body.numAssets).toBeGreaterThan(0)
    expect(res.body.assets.length).toBeGreaterThan(0)
}

function assertSuccessfulAssetSearchWithNoResults(res: request.Response) {
    expect(res.status).toBe(200)
    expect(res.body.numPages).toBe(0)
    expect(res.body.numAssets).toBe(0)
    expect(res.body.assets.length).toBe(0)
}

function assert401Status(res: request.Response) {
    expect(res.status).toBe(401)
}

describe("Asset text search", () => {
    const assetTextSearch = (queryString: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/asset/search${queryString}`)
                .set("Authorization", token)
                .then(assertSuccessfulAssetSearchWithResults)
        }
    }
    const assetTextSearchNoResults = (queryString: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/asset/search${queryString}`)
                .set("Authorization", token)
                .then(assertSuccessfulAssetSearchWithNoResults)
        }
    }
    // Fails
    it("Returns a 401 status when unauthenticated", () => {
        request("localhost:4001")
            .get("/api/asset/search")
            .then(assert401Status)
    })
    // No query string
    it("Tech can search assets - empty search string", assetTextSearch("", TECH_TOKEN!))
    it("Kiosk can search assets - empty search string", assetTextSearch("", KIOSK_TOKEN!))
    it("Inventory clerk can search assets - empty search string", assetTextSearch("", INVENTORY_TOKEN!))
    it("Admin clerk can search assets - empty search string", assetTextSearch("", ADMIN_TOKEN!))
    // Query string with empty searchString
    it("Tech can search assets - empty search string", assetTextSearch(EMPTY_TEXT_SEARCH_QUERY_STRING, TECH_TOKEN!))
    it("Kiosk can search assets - empty search string", assetTextSearch(EMPTY_TEXT_SEARCH_QUERY_STRING, KIOSK_TOKEN!))
    it("Inventory clerk can search assets - empty search string", assetTextSearch(EMPTY_TEXT_SEARCH_QUERY_STRING, INVENTORY_TOKEN!))
    it("Admin clerk can search assets - empty search string", assetTextSearch(EMPTY_TEXT_SEARCH_QUERY_STRING, ADMIN_TOKEN!))
    // Query string with search string
    it("Tech can search assets - keyword search", assetTextSearch(TEXT_SEARCH_QUERY_STRING, TECH_TOKEN!))
    it("Kiosk can search assets - keyword search", assetTextSearch(TEXT_SEARCH_QUERY_STRING, KIOSK_TOKEN!))
    it("Inventory clerk can search assets - keyword search", assetTextSearch(TEXT_SEARCH_QUERY_STRING, INVENTORY_TOKEN!))
    it("Admin clerk can search assets - keyword search", assetTextSearch(TEXT_SEARCH_QUERY_STRING, ADMIN_TOKEN!))
    // Query string with search string
    it("Tech can search assets - bad search has no results", assetTextSearchNoResults(TEXT_SEARCH_QUERY_STRING_NO_RESULTS, TECH_TOKEN!))
    it("Kiosk can search assets - bad search has no results", assetTextSearchNoResults(TEXT_SEARCH_QUERY_STRING_NO_RESULTS, KIOSK_TOKEN!))
    it("Inventory clerk can search assets - bad search has no results", assetTextSearchNoResults(TEXT_SEARCH_QUERY_STRING_NO_RESULTS, INVENTORY_TOKEN!))
    it("Admin clerk can search assets - bad search has no results", assetTextSearchNoResults(TEXT_SEARCH_QUERY_STRING_NO_RESULTS, ADMIN_TOKEN!))
})

describe("Get assets by data", () => {
    const getAsset = (queryString: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/asset${queryString}`)
                .set("Authorization", token)
                .then(assertSuccessfulAssetSearchWithResults)
        }
    }
    const getAssetUnauthenticated = (queryString: string) => {
        return () => {
            request("localhost:4001")
                .get(`/api/asset${queryString}`)
                .then(assert401Status)
        }
    }
    it("Returns a 401 status when unauthenticated", getAssetUnauthenticated(""))
    it("Tech can get assets by data - empty request", getAsset("?pageNum=1&pageSize=50", TECH_TOKEN!))
    it("Kiosk can get assets by data - empty request", getAsset("?pageNum=1&pageSize=50", KIOSK_TOKEN!))
    it("Inventory clerk can get assets by data - empty request", getAsset("?pageNum=1&pageSize=50", INVENTORY_TOKEN!))
    it("Admin can get assets by data - empty request", getAsset("?pageNum=1&pageSize=50", ADMIN_TOKEN!))
    // Try unauth
    it("Returns a 401 status when unauthenticated - filter by live servers", getAssetUnauthenticated(ADVANCED_SEARCH_QUERY_STRING))
    // With auth
    it("Tech can get assets by data - filter by live servers", getAsset(ADVANCED_SEARCH_QUERY_STRING, TECH_TOKEN!))
    it("Kiosk can get assets by data - filter by live servers", getAsset(ADVANCED_SEARCH_QUERY_STRING, KIOSK_TOKEN!))
    it("Inventory clerk can get assets by data - filter by live servers", getAsset(ADVANCED_SEARCH_QUERY_STRING, INVENTORY_TOKEN!))
    it("Admin can get assets by data - filter by live servers", getAsset(ADVANCED_SEARCH_QUERY_STRING, ADMIN_TOKEN!))
})

describe("Get asset by ID", () => {
    function assertSuccessfulGetAssetByID(asset_tag: string) {
        return (res: request.Response) => {
            expect(res.status).toBe(200)
            expect(res.body._id).toBeDefined()
            expect(res.body.asset_tag).toEqual(asset_tag)
        }
    }

    const getByAssetTag = (asset_tag: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/asset/id?id=${asset_tag}`)
                .set("Authorization", token)
                .then(assertSuccessfulGetAssetByID(asset_tag))
        }
    }

    const getByMongoID = (asset_tag: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/asset/id?id=${asset_tag}`)
                .set("Authorization", token!)
                .then((res)=>{
                    expect(res.status).toBe(200)
                    expect(res.body._id).toBeDefined()
                    expect(res.body.asset_tag).toEqual(asset_tag)
                    request("localhost:4001")
                        .get(`/api/asset/id?id=${res.body._id}`)
                        .set("Authorization", token!)
                        .then(assertSuccessfulGetAssetByID(asset_tag))
                })
        }
    }

    it("Returns a 401 status when unauthenticated", () => {
        request("localhost:4001")
            .get(`/api/asset/id?id=${ASSET_TAG}`)
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    it("Tech can get asset by asset tag", getByAssetTag(ASSET_TAG, TECH_TOKEN!))
    it("Kiosk can get asset by asset tag", getByAssetTag(ASSET_TAG, KIOSK_TOKEN!))
    it("Clerk can get asset by asset tag", getByAssetTag(ASSET_TAG, INVENTORY_TOKEN!))
    it("Admin can get asset by asset tag", getByAssetTag(ASSET_TAG, ADMIN_TOKEN!))
    it("Tech can get asset by mongo ID", getByMongoID(ASSET_TAG, TECH_TOKEN!))
    it("Kiosk can get asset by mongo ID", getByMongoID(ASSET_TAG, KIOSK_TOKEN!))
    it("Clerk can get asset by mongo ID", getByMongoID(ASSET_TAG, INVENTORY_TOKEN!))
    it("Admin can get asset by mongo ID", getByMongoID(ASSET_TAG, ADMIN_TOKEN!))
})

describe("Get parts on asset", () => {
    const getParts = (asset_tag: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/asset/parts?asset_tag=${asset_tag}`)
                .set("Authorization", token)
                .then((res)=>{
                    expect(res.status).toBe(200)
                    expect(res.body.parts).toBeDefined()
                    expect(res.body.records).toBeDefined()
                    expect(res.body.parts.length).toBeGreaterThan(0)
                    expect(res.body.records.length).toBeGreaterThan(0)
                })
        }
    }
    it("Returns 401 status when unauthenticated", () => {
        request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .then((res)=>{
                expect(res.status).toBe(401)
                expect(res.body[0]).toBeUndefined()
            })
    })
    it("Returns parts when authenticated - Tech", getParts(ASSET_TAG, TECH_TOKEN!))
    it("Returns parts when authenticated - Kiosk", getParts(ASSET_TAG, KIOSK_TOKEN!))
    it("Returns parts when authenticated - Clerk", getParts(ASSET_TAG, INVENTORY_TOKEN!))
    it("Returns parts when authenticated - Admin", getParts(ASSET_TAG, ADMIN_TOKEN!))
})

describe("Asset creation and deletion", () => {
    it("Returns 401 status when unauthenticated", () => {
        request("localhost:4001")
            .post("/api/asset")
            .send(generateAsset())
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    it("Returns 403 status when user is Kiosk ", () => {
        request("localhost:4001")
            .post("/api/asset")
            .send({ asset: generateAsset(), parts: []})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .set("Authorization", KIOSK_TOKEN!)
            .then((res)=>{
                expect(res.status).toBe(403)
            })
    })
    const check400 = (token: string) => {
        return () => {
            request("localhost:4001")
                .post("/api/asset")
                .send({asset: generateIncompleteAsset(), parts: []})
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .set("Authorization", token)
                .then((res)=>{
                    expect(res.status).toBe(400)
                })
        }
    }
    it("Returns 400 status when asset is incomplete - Tech", check400(TECH_TOKEN!))
    it("Returns 400 status when asset is incomplete - Clerk", check400(INVENTORY_TOKEN!))
    it("Returns 400 status when asset is incomplete - Admin", check400(ADMIN_TOKEN!))
    // Create and delete asset function
    const createAndDeleteAsset = (token: string) => {
        return async () => {
            let asset = generateAsset();
            // Create asset
            let assetRes = await request("localhost:4001")
                .post("/api/asset")
                .send({asset, parts: PARTS_LIST})
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .set("Authorization", token)
            // Expect success
            expect(assetRes.status).toBe(200)
            // Check if parts were all added
            let partRes = await request("localhost:4001")
                .get(`/api/asset/parts?asset_tag=${asset.asset_tag}`)
                .set("Authorization", token)
            // Expect success
            expect(partRes.status).toBe(200)
            // Compare parts lists
            expect(partsListsMatch(PARTS_LIST, partRes.body.records)).toBe(true)
            // Delete asset
            let deleteRes = await request("localhost:4001")
                .delete(`/api/asset?asset_tag=${asset.asset_tag}`)
                .set("Authorization", ADMIN_TOKEN!)
            // Expect success 
            expect(deleteRes.status).toBe(200)
            // Check if parts were deleted
            let partRes2 = await request("localhost:4001")
                .get(`/api/asset/parts?asset_tag=${asset.asset_tag}`)
                .set("Authorization", token)
            // Make sure there are no parts on now nonexistent asset
            expect(partRes2.body.records.length).toBe(0)
        }
    }

    it("Create asset, ensure parts were added correctly, then delete asset and send parts to all techs - Tech", createAndDeleteAsset(TECH_TOKEN!))
    it("Create asset, ensure parts were added correctly, then delete asset and send parts to all techs - Clerk", createAndDeleteAsset(INVENTORY_TOKEN!))
    it("Create asset, ensure parts were added correctly, then delete asset and send parts to all techs - Admin", createAndDeleteAsset(ADMIN_TOKEN!))
})

describe("Update asset", () => {
    it("If unauthenticated, return 401 status", () => {
        request("localhost:4001")
            .put("/api/asset")
            .send({asset: generateIncompleteAsset(), parts: []})
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    const addAndRemoveParts = (token: string) => {
        return async () => {
            jest.useRealTimers()
            let invRes = await request("localhost:4001")
                .get("/api/user/inventory")
                .set("Authorization", token)
            expect(invRes.status).toBe(200)
            expect(invRes.body.parts).toBeDefined()
            expect(invRes.body.records).toBeDefined()
            let startInventory = invRes.body.records as CartItem[];
            // Get parts on asset
            let assetPartRes = await request("localhost:4001")
                .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
                .set("Authorization", token)
            expect(assetPartRes.status).toBe(200)
            expect(assetPartRes.body.parts).toBeDefined()
            expect(assetPartRes.body.records).toBeDefined()
            // Map as cart items
            let startAssetParts = assetPartRes.body.records as CartItem[];
            // Get asset info
            let assetRes = await request("localhost:4001")
                .get(`/api/asset/id?id=${ASSET_TAG}`)
                .set("Authorization", token)
            expect(assetRes.status).toBe(200)
            expect(assetRes.body._id).toBeDefined()
            expect(assetRes.body.asset_tag).toBe(ASSET_TAG)
            // Save asset info
            let asset = assetRes.body as AssetSchema
            // Swap inventory parts and asset parts
            let update1res = await request("localhost:4001")
                .put("/api/asset")
                .set("Authorization", token)
                .send({ asset, parts: startInventory})
            expect(update1res.status).toBe(200)
            // Make sure inventory matches start asset
            let invRes2 = await request("localhost:4001")
                .get("/api/user/inventory")
                .set("Authorization", token)
            expect(invRes2.status).toBe(200)
            expect(partsListsMatch(startAssetParts, invRes2.body.records as CartItem[])).toBe(true)
            // Make sure asset matches start inventory
            let assetPartRes2 = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", token)
            expect(assetPartRes2.status).toBe(200)
            expect(partsListsMatch(startInventory, assetPartRes2.body.records as CartItem[])).toBe(true)
            // Revert asset and invetory back to start state
            let update2res = await request("localhost:4001")
                .put("/api/asset")
                .set("Authorization", token)
                .send({ asset, parts: startAssetParts})
            expect(update2res.status).toBe(200)
            // Get end asset parts
            let assetPartRes3 = await request("localhost:4001")
            .get(`/api/asset/parts?asset_tag=${ASSET_TAG}`)
            .set("Authorization", token)
            expect(assetPartRes3.status).toBe(200)
            let afterAssetPartList = assetPartRes3.body.records as CartItem[];
            // Get end inventory
            let invRes3 = await request("localhost:4001")
            .get("/api/user/inventory")
            .set("Authorization", token)
            expect(invRes3.status).toBe(200)
            let afterInv = invRes3.body.records as CartItem[]
            // Make sure start and end lists match
            expect(partsListsMatch(startAssetParts, afterAssetPartList)).toBe(true)
            expect(partsListsMatch(startInventory, afterInv)).toBe(true)
        }
    }
    it("Tech can add and remove parts with correct quantities", addAndRemoveParts(TECH_TOKEN!), 10000)
    it("Clerk can add and remove parts with correct quantities", addAndRemoveParts(INVENTORY_TOKEN!), 10000)
    it("Admin can add and remove parts with correct quantities", addAndRemoveParts(ADMIN_TOKEN!), 10000)
})

// Test serialized parts
