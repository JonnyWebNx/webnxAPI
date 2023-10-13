import request from 'supertest'
import config from "../config"
import { jest } from '@jest/globals'
import { CartItem, PalletSchema } from "../app/interfaces"
const { TECH_TOKEN, KIOSK_TOKEN, INVENTORY_TOKEN, ADMIN_TOKEN } = config
const PALLET_TAG = "PAL0000002"
const EMPTY_TEXT_SEARCH_QUERY_STRING = "?searchString=&pageNum=1&pageSize=50"
const TEXT_SEARCH_QUERY_STRING = "?searchString=pal&pageNum=1&pageSize=50"
const TEXT_SEARCH_QUERY_STRING_NO_RESULTS = "?searchString=afanepfiasfkacaeipas&pageNum=1&pageSize=50"
const ADVANCED_SEARCH_QUERY_STRING = "?location=testlocation&advanced=true&pageNum=1&pageSize=50"

const TEST_PALLET = {
    pallet_tag: "",
    building: 3,
    location: "test script location",
    notes: "Test script notes"
}

const INCOMPLETE_PALLET = {
    pallet_tag: generatePalletTag(),
}

const PARTS_LIST = [
    { nxid: "PNX0000001", quantity: 2} as CartItem,
    { nxid: "PNX0000003", quantity: 4} as CartItem,
    { nxid: "PNX0000004", quantity: 1} as CartItem,
    { nxid: "PNX0000008", quantity: 1} as CartItem,
]

function generatePalletTag(){
    let num = Math.floor(1000000 + Math.random() * 9000000)
    return `PAL${num}`
}

function generatePallet() {
    let tempPallet = JSON.parse(JSON.stringify(TEST_PALLET))
    tempPallet.pallet_tag = generatePalletTag()
    return tempPallet as PalletSchema;
}

function generateIncompletePallet() {
    let tempPallet = JSON.parse(JSON.stringify(INCOMPLETE_PALLET))
    tempPallet.pallet_tag = generatePalletTag()
    return tempPallet as PalletSchema;
}

function wait(time: number) {
    return new Promise<void>((res)=>{
        setTimeout(res, time)
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

function assertSuccessfulPalletSearchWithResults(res: request.Response) {
    expect(res.status).toBe(200)
    expect(res.body.numPages).toBeGreaterThan(0)
    expect(res.body.numPallets).toBeGreaterThan(0)
    expect(res.body.pallets.length).toBeGreaterThan(0)
}

function assertSuccessfulPalletSearchWithNoResults(res: request.Response) {
    expect(res.status).toBe(200)
    expect(res.body.numPages).toBe(0)
    expect(res.body.numPallets).toBe(0)
    expect(res.body.pallets.length).toBe(0)
}

function assert401Status(res: request.Response) {
    expect(res.status).toBe(401)
}

describe("Pallet text search", () => {
    const palletTextSearch = (queryString: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/pallet/search${queryString}`)
                .set("Authorization", token)
                .then(assertSuccessfulPalletSearchWithResults)
        }
    }
    const palletTextSearchNoResults = (queryString: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/pallet/search${queryString}`)
                .set("Authorization", token)
                .then(assertSuccessfulPalletSearchWithNoResults)
        }
    }
    // Fails
    it("Returns a 401 status when unauthenticated", () => {
        request("localhost:4001")
            .get("/api/pallet/search")
            .then(assert401Status)
    })
    // No query string
    it("Tech can search pallets - empty search string", palletTextSearch("", TECH_TOKEN!))
    it("Kiosk can search pallets - empty search string", palletTextSearch("", KIOSK_TOKEN!))
    it("Inventory clerk can search pallets - empty search string", palletTextSearch("", INVENTORY_TOKEN!))
    it("Admin clerk can search pallets - empty search string", palletTextSearch("", ADMIN_TOKEN!))
    // Query string with empty searchString
    it("Tech can search pallets - empty search string", palletTextSearch(EMPTY_TEXT_SEARCH_QUERY_STRING, TECH_TOKEN!))
    it("Kiosk can search pallets - empty search string", palletTextSearch(EMPTY_TEXT_SEARCH_QUERY_STRING, KIOSK_TOKEN!))
    it("Inventory clerk can search pallets - empty search string", palletTextSearch(EMPTY_TEXT_SEARCH_QUERY_STRING, INVENTORY_TOKEN!))
    it("Admin clerk can search pallets - empty search string", palletTextSearch(EMPTY_TEXT_SEARCH_QUERY_STRING, ADMIN_TOKEN!))
    // Query string with search string
    it("Tech can search pallets - keyword search", palletTextSearch(TEXT_SEARCH_QUERY_STRING, TECH_TOKEN!))
    it("Kiosk can search pallets - keyword search", palletTextSearch(TEXT_SEARCH_QUERY_STRING, KIOSK_TOKEN!))
    it("Inventory clerk can search pallets - keyword search", palletTextSearch(TEXT_SEARCH_QUERY_STRING, INVENTORY_TOKEN!))
    it("Admin clerk can search pallets - keyword search", palletTextSearch(TEXT_SEARCH_QUERY_STRING, ADMIN_TOKEN!))
    // Query string with search string
    it("Tech can search pallets - bad search has no results", palletTextSearchNoResults(TEXT_SEARCH_QUERY_STRING_NO_RESULTS, TECH_TOKEN!))
    it("Kiosk can search pallets - bad search has no results", palletTextSearchNoResults(TEXT_SEARCH_QUERY_STRING_NO_RESULTS, KIOSK_TOKEN!))
    it("Inventory clerk can search pallets - bad search has no results", palletTextSearchNoResults(TEXT_SEARCH_QUERY_STRING_NO_RESULTS, INVENTORY_TOKEN!))
    it("Admin clerk can search pallets - bad search has no results", palletTextSearchNoResults(TEXT_SEARCH_QUERY_STRING_NO_RESULTS, ADMIN_TOKEN!))
})

describe("Get pallets by data", () => {
    const getPallet = (queryString: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/pallet${queryString}`)
                .set("Authorization", token)
                .then(assertSuccessfulPalletSearchWithResults)
        }
    }
    const getPalletUnauthenticated = (queryString: string) => {
        return () => {
            request("localhost:4001")
                .get(`/api/pallet${queryString}`)
                .then(assert401Status)
        }
    }
    it("Returns a 401 status when unauthenticated", getPalletUnauthenticated(""))
    it("Tech can get pallets by data - empty request", getPallet("?pageNum=1&pageSize=50", TECH_TOKEN!))
    it("Kiosk can get pallets by data - empty request", getPallet("?pageNum=1&pageSize=50", KIOSK_TOKEN!))
    it("Inventory clerk can get pallets by data - empty request", getPallet("?pageNum=1&pageSize=50", INVENTORY_TOKEN!))
    it("Admin can get pallets by data - empty request", getPallet("?pageNum=1&pageSize=50", ADMIN_TOKEN!))
    // Try unauth
    it("Returns a 401 status when unauthenticated - filter by live servers", getPalletUnauthenticated(ADVANCED_SEARCH_QUERY_STRING))
    // With auth
    it("Tech can get pallets by data - filter by live servers", getPallet(ADVANCED_SEARCH_QUERY_STRING, TECH_TOKEN!))
    it("Kiosk can get pallets by data - filter by live servers", getPallet(ADVANCED_SEARCH_QUERY_STRING, KIOSK_TOKEN!))
    it("Inventory clerk can get pallets by data - filter by live servers", getPallet(ADVANCED_SEARCH_QUERY_STRING, INVENTORY_TOKEN!))
    it("Admin can get pallets by data - filter by live servers", getPallet(ADVANCED_SEARCH_QUERY_STRING, ADMIN_TOKEN!))
})

describe("Get pallet by ID", () => {
    function assertSuccessfulGetPalletByID(pallet_tag: string) {
        return (res: request.Response) => {
            expect(res.status).toBe(200)
            expect(res.body._id).toBeDefined()
            expect(res.body.pallet_tag).toEqual(pallet_tag)
        }
    }

    const getByPalletTag = (pallet_tag: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/pallet/id?id=${pallet_tag}`)
                .set("Authorization", token)
                .then(assertSuccessfulGetPalletByID(pallet_tag))
        }
    }

    const getByMongoID = (pallet_tag: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/pallet/id?id=${pallet_tag}`)
                .set("Authorization", token!)
                .then((res)=>{
                    expect(res.status).toBe(200)
                    expect(res.body._id).toBeDefined()
                    expect(res.body.pallet_tag).toEqual(pallet_tag)
                    request("localhost:4001")
                        .get(`/api/pallet/id?id=${res.body._id}`)
                        .set("Authorization", token!)
                        .then(assertSuccessfulGetPalletByID(pallet_tag))
                })
        }
    }

    it("Returns a 401 status when unauthenticated", () => {
        request("localhost:4001")
            .get(`/api/pallet/id?id=${PALLET_TAG}`)
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    it("Tech can get pallet by pallet tag", getByPalletTag(PALLET_TAG, TECH_TOKEN!))
    it("Kiosk can get pallet by pallet tag", getByPalletTag(PALLET_TAG, KIOSK_TOKEN!))
    it("Clerk can get pallet by pallet tag", getByPalletTag(PALLET_TAG, INVENTORY_TOKEN!))
    it("Admin can get pallet by pallet tag", getByPalletTag(PALLET_TAG, ADMIN_TOKEN!))
    it("Tech can get pallet by mongo ID", getByMongoID(PALLET_TAG, TECH_TOKEN!))
    it("Kiosk can get pallet by mongo ID", getByMongoID(PALLET_TAG, KIOSK_TOKEN!))
    it("Clerk can get pallet by mongo ID", getByMongoID(PALLET_TAG, INVENTORY_TOKEN!))
    it("Admin can get pallet by mongo ID", getByMongoID(PALLET_TAG, ADMIN_TOKEN!))
})

describe("Get parts on pallet", () => {
    const getParts = (pallet_tag: string, token: string)  => {
        return () => {
            request("localhost:4001")
                .get(`/api/pallet/parts?pallet_tag=${pallet_tag}`)
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
            .get(`/api/pallet/parts?pallet_tag=${PALLET_TAG}`)
            .then((res)=>{
                expect(res.status).toBe(401)
                expect(res.body[0]).toBeUndefined()
            })
    })
    it("Returns parts when authenticated - Tech", getParts(PALLET_TAG, TECH_TOKEN!))
    it("Returns parts when authenticated - Kiosk", getParts(PALLET_TAG, KIOSK_TOKEN!))
    it("Returns parts when authenticated - Clerk", getParts(PALLET_TAG, INVENTORY_TOKEN!))
    it("Returns parts when authenticated - Admin", getParts(PALLET_TAG, ADMIN_TOKEN!))
})

describe("Pallet creation and deletion", () => {
    it("Returns 401 status when unauthenticated", () => {
        request("localhost:4001")
            .post("/api/pallet")
            .send(generatePallet())
            .set('Content-Type', 'application/json')
            .set('Accept', 'application/json')
            .then((res)=>{
                expect(res.status).toBe(401)
            })
    })
    it("Returns 403 status when user is Kiosk ", () => {
        request("localhost:4001")
            .post("/api/pallet")
            .send({ pallet: generatePallet(), parts: []})
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
                .post("/api/pallet")
                .send({pallet: generateIncompletePallet(), parts: []})
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .set("Authorization", token)
                .then((res)=>{
                    expect(res.status).toBe(400)
                })
        }
    }
    it("Returns 400 status when pallet is incomplete - Tech", check400(TECH_TOKEN!))
    it("Returns 400 status when pallet is incomplete - Clerk", check400(INVENTORY_TOKEN!))
    it("Returns 400 status when pallet is incomplete - Admin", check400(ADMIN_TOKEN!))
    // Create and delete pallet function
    const createAndDeletePallet = (token: string) => {
        return async () => {
            let pallet = generatePallet();
            // Create pallet
            let palletRes = await request("localhost:4001")
                .post("/api/pallet")
                .send({pallet, parts: PARTS_LIST})
                .set('Content-Type', 'application/json')
                .set('Accept', 'application/json')
                .set("Authorization", token)
            // Expect success
            expect(palletRes.status).toBe(200)
            // Check if parts were all added
            let partRes = await request("localhost:4001")
                .get(`/api/pallet/parts?pallet_tag=${pallet.pallet_tag}`)
                .set("Authorization", token)
            // Expect success
            expect(partRes.status).toBe(200)
            // Compare parts lists
            expect(partsListsMatch(PARTS_LIST, partRes.body.records)).toBe(true)
            // Delete pallet
            let deleteRes = await request("localhost:4001")
                .delete(`/api/pallet?pallet_tag=${pallet.pallet_tag}`)
                .set("Authorization", ADMIN_TOKEN!)
            // Expect success 
            expect(deleteRes.status).toBe(200)
            // Check if parts were deleted
            let partRes2 = await request("localhost:4001")
                .get(`/api/pallet/parts?pallet_tag=${pallet.pallet_tag}`)
                .set("Authorization", token)
            // Make sure there are no parts on now nonexistent pallet
            expect(partRes2.body.records.length).toBe(0)
        }
    }

    it("Create pallet, ensure parts were added correctly, then delete pallet and send parts to all techs - Tech", createAndDeletePallet(TECH_TOKEN!))
    it("Create pallet, ensure parts were added correctly, then delete pallet and send parts to all techs - Clerk", createAndDeletePallet(INVENTORY_TOKEN!))
    it("Create pallet, ensure parts were added correctly, then delete pallet and send parts to all techs - Admin", createAndDeletePallet(ADMIN_TOKEN!))
})

describe("Update pallet", () => {
    it("If unauthenticated, return 401 status", () => {
        request("localhost:4001")
            .put("/api/pallet")
            .send({pallet: generateIncompletePallet(), parts: []})
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
            // Get parts on pallet
            let palletPartRes = await request("localhost:4001")
                .get(`/api/pallet/parts?pallet_tag=${PALLET_TAG}`)
                .set("Authorization", token)
            expect(palletPartRes.status).toBe(200)
            expect(palletPartRes.body.parts).toBeDefined()
            expect(palletPartRes.body.records).toBeDefined()
            // Map as cart items
            let startPalletParts = palletPartRes.body.records as CartItem[];
            // Get pallet info
            let palletRes = await request("localhost:4001")
                .get(`/api/pallet/id?id=${PALLET_TAG}`)
                .set("Authorization", token)
            expect(palletRes.status).toBe(200)
            expect(palletRes.body._id).toBeDefined()
            expect(palletRes.body.pallet_tag).toBe(PALLET_TAG)
            // Save pallet info
            let pallet = palletRes.body as PalletSchema
            // Swap inventory parts and pallet parts
            let update1res = await request("localhost:4001")
                .put("/api/pallet")
                .set("Authorization", token)
                .send({ pallet, parts: startInventory})
            expect(update1res.status).toBe(200)
            // Make sure inventory matches start pallet
            let invRes2 = await request("localhost:4001")
                .get("/api/user/inventory")
                .set("Authorization", token)
            expect(invRes2.status).toBe(200)
            expect(partsListsMatch(startPalletParts, invRes2.body.records as CartItem[])).toBe(true)
            // Make sure pallet matches start inventory
            let palletPartRes2 = await request("localhost:4001")
                .get(`/api/pallet/parts?pallet_tag=${PALLET_TAG}`)
                .set("Authorization", token)
            expect(palletPartRes2.status).toBe(200)
            expect(partsListsMatch(startInventory, palletPartRes2.body.records as CartItem[])).toBe(true)
            // Revert pallet and invetory back to start state
            let update2res = await request("localhost:4001")
                .put("/api/pallet")
                .set("Authorization", token)
                .send({ pallet, parts: startPalletParts})
            expect(update2res.status).toBe(200)
            // Get end pallet parts
            let palletPartRes3 = await request("localhost:4001")
                .get(`/api/pallet/parts?pallet_tag=${PALLET_TAG}`)
                .set("Authorization", token)
            expect(palletPartRes3.status).toBe(200)
            let afterPalletPartList = palletPartRes3.body.records as CartItem[];
            // Get end inventory
            let invRes3 = await request("localhost:4001")
                .get("/api/user/inventory")
                .set("Authorization", token)
            expect(invRes3.status).toBe(200)
            let afterInv = invRes3.body.records as CartItem[]
            // Make sure start and end lists match
            expect(partsListsMatch(startPalletParts, afterPalletPartList)).toBe(true)
            expect(partsListsMatch(startInventory, afterInv)).toBe(true)
            jest.useFakeTimers()
        }
    }
    it("Tech can add and remove parts with correct quantities", addAndRemoveParts(TECH_TOKEN!))
    it("Clerk can add and remove parts with correct quantities", addAndRemoveParts(INVENTORY_TOKEN!))
    it("Admin can add and remove parts with correct quantities", addAndRemoveParts(ADMIN_TOKEN!))
})

describe("",()=>{

})

// Test serialized parts
