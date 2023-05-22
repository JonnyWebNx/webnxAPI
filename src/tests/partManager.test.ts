import request from 'supertest'
import config from "../config"
import { PartSchema } from "../app/interfaces"
const { TECH_TOKEN, KIOSK_TOKEN, INVENTORY_TOKEN, ADMIN_TOKEN } = config

const NXID = "PNX0000002"

const TEST_PART = {
    nxid: "PNX0016498",
    manufacturer: "Nvidia",
    name: "RTX 2080",
    type: "GPU",
    quantity: 3,
    serialized: true,
    shelf_location: "J10"
} as PartSchema

const INCOMPLETE_PART = {
    nxid: "PNX0011639",
    manufacturer: "Supermicro",
    chipset: "LGA2011-v3",
    shelf_location: "G10",
    quantity: 0
}

function generatePart() {
    let tempPart = JSON.parse(JSON.stringify(TEST_PART))
    let num = Math.floor(1000000 + Math.random() * 9000000)
    tempPart.nxid = `PNX${num}`
    return tempPart as PartSchema;
}
function generateIncompletePart() {
    let tempPart = JSON.parse(JSON.stringify(INCOMPLETE_PART))
    let num = Math.floor(1000000 + Math.random() * 9000000)
    tempPart.nxid = `PNX${num}`
    return tempPart as PartSchema;
}
const emptySearch = (token: string, text: string) => {
    // expect(0).toBe(1)
    request("localhost:4001")
        .get(`/api/part/search?searchString=${text}&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
        .set("Authorization", token)
        .then((search) => {
            expect(search.statusCode).toBe(200)
            expect(search.body.length).toBe(0)
        })
}
const textSearch = (token: string, query: string) => {
    // expect(0).toBe(1)
    request("localhost:4001")
        .get(`/api/part/search?searchString=${query}&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
        .set("Authorization", token)
        .then((search) => {
            expect(search.statusCode).toBe(200)
            expect(search.body.length).toBeGreaterThan(0)
        })
}
describe("Create, get, update and delete parts", () => {
    
    it("Incomplete part results in 400 status", async () => {
        let incompletePart = generateIncompletePart()
        let res = await request("localhost:4001")
            .post("/api/part")
            .send({part: incompletePart})
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.statusCode).toBe(400)
        
    })
    const createAndDelete = async (token: string) => {
        // Create part
        let completePart = generatePart()
        let create = await request("localhost:4001")
            .post("/api/part")
            .send({part: completePart})
            .set("Authorization", token)
        expect(create.statusCode).toBe(200)
        await new Promise(res => setTimeout(res, 500))
        // Get the part by nxid
        let get1 = await request("localhost:4001")
            .get(`/api/part/id?id=${completePart.nxid}`)
            .set("Authorization", token)
        expect(get1.statusCode).toBe(200)
        expect(get1.body.total_quantity).toBe(completePart.quantity)
        
        // Search part by data
        let searchPart = JSON.parse(JSON.stringify(completePart))
        delete searchPart.nxid
        delete searchPart._id
        delete searchPart.total_quantity
        delete searchPart.quantity
        searchPart.location = "Parts Room"
        searchPart.building = 3
        searchPart.pageNum = 1
        searchPart.pageSize = 50
        let query = new URLSearchParams()
        Object.keys(searchPart).map(key => {query.set(key, searchPart[key])});
        let queryString = query.toString()
        let get2 = await request("localhost:4001")
            .get(`/api/part?${queryString}`)
            .set("Authorization", token)
        expect(get2.statusCode).toBe(200)
        expect(get2.body[0].nxid).toBe(completePart.nxid)
        // Invalid add to inventory request
        let invalidAdd = await request("localhost:4001")
            .post("/api/part/add")
            .send({
                part: {
                    nxid: completePart.nxid,
                    location: "Parts Room",
                    building: 3,
                    quantity: -3
                },
                owner: ""
            })
            .set("Authorization", token)
        expect(invalidAdd.statusCode).toBe(400)
        // Valid add
        let add = await request("localhost:4001")
            .post("/api/part/add")
            .send({
                part: {
                    nxid: completePart.nxid,
                    location: "Parts Room",
                    building: 3,
                    quantity: 5
                },
                owner: ""
            })
            .set("Authorization", token)
        expect(add.statusCode).toBe(200)
        await new Promise(res => setTimeout(res, 500))
        // Check new quantity
        let get3 = await request("localhost:4001")
            .get(`/api/part?location=Parts+Room&building=3&${queryString}`)
            .set("Authorization", token)
        expect(get3.statusCode).toBe(200)
        expect(get3.body[0].total_quantity).toBe(5+completePart.quantity!)
        // Delete
        let deletePart = await request("localhost:4001")
            .delete(`/api/part?nxid=${completePart.nxid}`)
            .set("Authorization", token)
        expect(deletePart.statusCode).toBe(200)
    }
    it ("Create part, search for it, add to quantity, and delete it - Admin", () => createAndDelete(ADMIN_TOKEN!))
    it ("Create part, search for it, add to quantity, and delete it - Clerk", () => createAndDelete(INVENTORY_TOKEN!))
})
describe("Tech", () => {
    it ("Tech cannot create parts", async () => {
        let completePart = generatePart()
        // Create part
        let create = await request("localhost:4001")
            .post("/api/part")
            .send({part: completePart})
            .set("Authorization", TECH_TOKEN!)
        expect(create.statusCode).toBe(403)
    })
    it ("Tech can get part by ID", async () => {
        let get = await request("localhost:4001")
            .get(`/api/part/id?id=${NXID}`)
            .set("Authorization", TECH_TOKEN!)
        expect(get.statusCode).toBe(200)
    })
    it ("Tech can get part by data", async () => {
        let completePart = generatePart()
        let searchPart = JSON.parse(JSON.stringify(completePart))
        delete searchPart.nxid
        delete searchPart._id
        delete searchPart.total_quantity
        delete searchPart.quantity
        delete searchPart.name
        delete searchPart.shelf_location
        searchPart.location = "Parts Room"
        searchPart.building = 3
        searchPart.pageNum = 1
        searchPart.pageSize = 50
        let query = new URLSearchParams()
        Object.keys(searchPart).map(key => {query.set(key, searchPart[key])});
        let queryString = query.toString()
        let get2 = await request("localhost:4001")
            .get(`/api/part?${queryString}`)
            .set("Authorization", TECH_TOKEN!)
        expect(get2.statusCode).toBe(200)
    })
    it ("Tech cannot add parts", async () => {
    let add = await request("localhost:4001")
        .post("/api/part/add")
        .send({
            part: {
                nxid: NXID,
                location: "Parts Room",
                building: 3,
                quantity: 5
            },
            owner: ""
        })
        .set("Authorization", TECH_TOKEN!)
    expect(add.statusCode).toBe(403)
    })
    it ("Tech cannot delete part", async () => {
        let deletePart = await request("localhost:4001")
            .delete(`/api/part?nxid=${NXID}`)
            .set("Authorization", TECH_TOKEN!)
        expect(deletePart.statusCode).toBe(403)
    })
})

describe("Kiosk", () => {
    it ("Kiosk cannot create parts", async () => {
        let completePart = generatePart()
        // Create part
        let create = await request("localhost:4001")
            .post("/api/part")
            .send({part: completePart})
            .set("Authorization", KIOSK_TOKEN!)
        expect(create.statusCode).toBe(403)
    })
    it ("Kiosk can get part by ID", async () => {
        let get = await request("localhost:4001")
            .get(`/api/part/id?id=${NXID}`)
            .set("Authorization", KIOSK_TOKEN!)
        expect(get.statusCode).toBe(200)
    })
    it ("Kiosk can get part by data", async () => {
        let completePart = generatePart()
        let searchPart = JSON.parse(JSON.stringify(completePart))
        delete searchPart.nxid
        delete searchPart._id
        delete searchPart.total_quantity
        delete searchPart.quantity
        delete searchPart.name
        delete searchPart.shelf_location
        searchPart.location = "Parts Room"
        searchPart.building = 3
        searchPart.pageNum = 1
        searchPart.pageSize = 50
        let query = new URLSearchParams()
        Object.keys(searchPart).map(key => {query.set(key, searchPart[key])});
        let queryString = query.toString()
        let get2 = await request("localhost:4001")
            .get(`/api/part?${queryString}`)
            .set("Authorization", KIOSK_TOKEN!)
        expect(get2.statusCode).toBe(200)
    })
    it ("Kiosk cannot add parts", async () => {
    let add = await request("localhost:4001")
        .post("/api/part/add")
        .send({
            part: {
                nxid: NXID,
                location: "Parts Room",
                building: 3,
                quantity: 5
            },
            owner: ""
        })
        .set("Authorization", KIOSK_TOKEN!)
    expect(add.statusCode).toBe(403)
    })
    it ("Kiosk cannot delete part", async () => {
        let deletePart = await request("localhost:4001")
            .delete(`/api/part?nxid=${NXID}`)
            .set("Authorization", KIOSK_TOKEN!)
        expect(deletePart.statusCode).toBe(403)
    })
})
describe("Text search", () => {
    it("Tech - no text", () => textSearch(TECH_TOKEN!, ""))
    it("Kiosk - no text", () => textSearch(KIOSK_TOKEN!, ""))
    it("Clerk - no text", () => textSearch(INVENTORY_TOKEN!, ""))
    it("Admin - no text", () => textSearch(ADMIN_TOKEN!, ""))
    it("Tech - with valid text", () => textSearch(TECH_TOKEN!, "rtx"))
    it("Kiosk - with valid text", () => textSearch(KIOSK_TOKEN!, "rtx"))
    it("Clerk - with valid text", () => textSearch(INVENTORY_TOKEN!, "rtx"))
    it("Admin - with valid text", () => textSearch(ADMIN_TOKEN!, "rtx"))
    let invalidText = "asdbfaisubiuyafbzb"
    it("Tech - with invalid text", () => emptySearch(TECH_TOKEN!, invalidText))
    it("Kiosk - with invalid text", () => emptySearch(KIOSK_TOKEN!, invalidText))
    it("Clerk - with invalid text", () => emptySearch(INVENTORY_TOKEN!, invalidText))
    it("Admin - with invalid text", () => emptySearch(ADMIN_TOKEN!, invalidText))
})
// Checkout
describe("Checkout", () => {
    request("localhost:4001")
        .get(`/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
        .set("Authorization", KIOSK_TOKEN!)
        .then((res) =>{
            let parts = res.body
            let checkoutPart = {}
            for (let part of parts) {
                if(part.quantity>0) {
                    checkoutPart = part
                }
            }
            
        })
})
// Checkin

// Get distinct on part records

// Get distinct on part info

// Move part records