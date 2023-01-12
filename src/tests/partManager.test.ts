import request from 'supertest'
import config from "../config"
import {jest} from '@jest/globals'
import { PartSchema, CartItem, LoadedCartItem,  } from "../app/interfaces"
const { TECH_TOKEN, KIOSK_TOKEN, INVENTORY_TOKEN, ADMIN_TOKEN } = config

const NXID = "PNX0016477"

const TEST_PART = {
    nxid: "PNX0016498",
    manufacturer: "Nvidia",
    name: "RTX 2080",
    type: "GPU",
    quantity: 3,
    shelf_location: "J10"
}

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
describe("Create, get, update and delete parts", () => {
    
    it("Incomplete part results in 400 status", async () => {
        let incompletePart = generateIncompletePart()
        let res = await request("localhost:4001")
            .post("/api/part")
            .send({part: incompletePart})
            .set("Authorization", ADMIN_TOKEN!)
        expect(res.statusCode).toBe(400)
        
    })
    it ("Create part, search for it, add to quantity, and delete it - Admin", async () => {
        // Create part
        let completePart = generatePart()
        let create = await request("localhost:4001")
            .post("/api/part")
            .send({part: completePart})
            .set("Authorization", ADMIN_TOKEN!)
        expect(create.statusCode).toBe(200)
        await new Promise(res => setTimeout(res, 500))
        // Get the part by nxid
        let get1 = await request("localhost:4001")
            .get(`/api/part/id?id=${completePart.nxid}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(get1.statusCode).toBe(200)
        expect(get1.body.total_quantity).toBe(completePart.quantity)
        
        // Search part by data
        let searchPart = JSON.parse(JSON.stringify(completePart))
        delete searchPart.nxid
        delete searchPart._id
        delete searchPart.total_quantity
        delete searchPart.quantity
        var queryString = Object.keys(searchPart).map(key => "part[" + key + ']=' + searchPart[key]).join('&');
        let get2 = await request("localhost:4001")
            .get(`/api/part?location=Parts+Room&building=3&${queryString}`)
            .set("Authorization", ADMIN_TOKEN!)
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
            .set("Authorization", ADMIN_TOKEN!)
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
            .set("Authorization", ADMIN_TOKEN!)
        expect(add.statusCode).toBe(200)
        await new Promise(res => setTimeout(res, 500))
        // Check new quantity
        let get3 = await request("localhost:4001")
            .get(`/api/part?location=Parts+Room&building=3&${queryString}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(get3.statusCode).toBe(200)
        expect(get3.body[0].total_quantity).toBe(5+completePart.quantity!)
        // Delete
        let deletePart = await request("localhost:4001")
            .delete(`/api/part?nxid=${completePart.nxid}`)
            .set("Authorization", ADMIN_TOKEN!)
        expect(deletePart.statusCode).toBe(200)
    })
    it ("Create part, search for it, add to quantity, and delete it - Clerk", async () => {
        let completePart = generatePart()
        // Create part
        let create = await request("localhost:4001")
            .post("/api/part")
            .send({part: completePart})
            .set("Authorization", INVENTORY_TOKEN!)
        expect(create.statusCode).toBe(200)
        await new Promise(res => setTimeout(res, 500))
        // Get the part by nxid
        let get1 = await request("localhost:4001")
            .get(`/api/part/id?id=${completePart.nxid}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(get1.statusCode).toBe(200)
        expect(get1.body.total_quantity).toBe(completePart.quantity)
        
        // Search part by data
        let searchPart = JSON.parse(JSON.stringify(completePart))
        delete searchPart.nxid
        delete searchPart._id
        delete searchPart.total_quantity
        delete searchPart.quantity
        var queryString = Object.keys(searchPart).map(key => "part[" + key + ']=' + searchPart[key]).join('&');
        let get2 = await request("localhost:4001")
            .get(`/api/part?location=Parts+Room&building=3&${queryString}`)
            .set("Authorization", INVENTORY_TOKEN!)
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
            .set("Authorization", INVENTORY_TOKEN!)
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
            .set("Authorization", INVENTORY_TOKEN!)
        expect(add.statusCode).toBe(200)
        await new Promise(res => setTimeout(res, 500))
        // Check new quantity
        let get3 = await request("localhost:4001")
            .get(`/api/part?location=Parts+Room&building=3&${queryString}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(get3.statusCode).toBe(200)
        expect(get3.body[0].total_quantity).toBe(5+completePart.quantity!)
        // Delete
        let deletePart = await request("localhost:4001")
            .delete(`/api/part?nxid=${completePart.nxid}`)
            .set("Authorization", INVENTORY_TOKEN!)
        expect(deletePart.statusCode).toBe(200)
    })
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
        var queryString = Object.keys(searchPart).map(key => "part[" + key + ']=' + searchPart[key]).join('&');
        let get2 = await request("localhost:4001")
            .get(`/api/part?location=Parts+Room&building=3&${queryString}`)
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
        var queryString = Object.keys(searchPart).map(key => "part[" + key + ']=' + searchPart[key]).join('&');
        let get2 = await request("localhost:4001")
            .get(`/api/part?location=Parts+Room&building=3&${queryString}`)
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
    it("Tech - no text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", TECH_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBeGreaterThan(0)
    })
    it("Kiosk - no text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", KIOSK_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBeGreaterThan(0)
    })
    it("Clerk - no text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", INVENTORY_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBeGreaterThan(0)
    })
    it("Admin - no text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", ADMIN_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBeGreaterThan(0)
    })
    it("Tech - with valid text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=rtx&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", TECH_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBeGreaterThan(0)
    })
    it("Kiosk - with valid text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=rtx&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", KIOSK_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBeGreaterThan(0)
    })
    it("Clerk - with valid text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=rtx&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", INVENTORY_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBeGreaterThan(0)
    })
    it("Admin - with valid text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=rtx&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", ADMIN_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBeGreaterThan(0)
    })
    it("Tech - with invalid text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=asdbfaisubiuyafbzb&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", TECH_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBe(0)
    })
    it("Kiosk - with invalid text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=asdbfaisubiuyafbzb&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", KIOSK_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBe(0)
    })
    it("Clerk - with invalid text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=asdbfaisubiuyafbzb&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", INVENTORY_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBe(0)
    })
    it("Admin - with invalid text", async () => {
        let search = await request("localhost:4001")
            .get("/api/part/search?searchString=asdbfaisubiuyafbzb&pageNum=1&pageSize=50&building=3&location=Parts+Room")
            .set("Authorization", ADMIN_TOKEN!)
        expect(search.statusCode).toBe(200)
        expect(search.body.length).toBe(0)
    })
})
// Checkout

// Checkin

// Get distinct on part records

// Get distinct on part info

// Move part records