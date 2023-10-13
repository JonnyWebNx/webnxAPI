import request from 'supertest'
import config from "../config"
import { CartItem, PartQuery, PartRecordSchema, PartSchema, InventoryEntry } from "../app/interfaces"
import { jest } from '@jest/globals'
const { TECH_TOKEN, KIOSK_TOKEN, INVENTORY_TOKEN, ADMIN_TOKEN } = config

const NXID = "PNX0000002"
const TECH_USER_ID = '6362d580f36c5c9589f579be'
const CLERK_USER_ID = '645c048b6c466860a4de2a78'
const ADMIN_USER_ID = '634e3e4a6c5d3490babcdc21'
const KIOSK_USER_ID = '6359a5e18b4a852bbb37d893'
const SALES_USER_ID = '6477a48405d7c5fea18dd09e'

const TEST_PART = {
    nxid: "PNX0016498",
    manufacturer: "Nvidia",
    name: "RTX 2080",
    type: "GPU",
    quantity: 3,
    serialized: false,
    shelf_location: "J10"
} as PartSchema

const INCOMPLETE_PART = {
    nxid: "PNX0011639",
    manufacturer: "Supermicro",
    chipset: "LGA2011-v3",
    shelf_location: "G10",
    quantity: 0
}
// Generates part with all required data
function generatePart() {
    let tempPart = JSON.parse(JSON.stringify(TEST_PART))
    let num = Math.floor(1000000 + Math.random() * 9000000)
    tempPart.nxid = `PNX${num}`
    return tempPart as PartSchema;
}
// Generates a part with intentionally missing data
function generateIncompletePart() {
    let tempPart = JSON.parse(JSON.stringify(INCOMPLETE_PART))
    let num = Math.floor(1000000 + Math.random() * 9000000)
    tempPart.nxid = `PNX${num}`
    return tempPart as PartSchema;
}
// Alternative to settimeout 
// function timeout(ms: number) {
//     jest.useRealTimers()
//     return new Promise(resolve => setTimeout(resolve, ms));
// }
// Check if items in cart have been checked out
function checkIfCheckedOut(cart: CartItem[]){
    return Promise.all(
        cart.map(async (part) => {
            let res = await request("localhost:4001")
                .get(`/api/part/id?id=${part.nxid}&building=3&location=Parts+Room`)
                .set("Authorization", KIOSK_TOKEN!)
            expect(res.statusCode).toBe(200)
            if(!part.serial)
                expect(res.body.quantity).toBe(0)
        })
    )
}

// Check if items in cart have been checked in
function checkIfCheckedIn(cart: CartItem[]){
    return Promise.all(
        cart.map(async (part) => {
            let res = await request("localhost:4001")
                .get(`/api/part/id?id=${part.nxid}&building=3&location=Parts+Room`)
                .set("Authorization", KIOSK_TOKEN!)
            expect(res.statusCode).toBe(200)
            if(!part.serial)
                expect(res.body.quantity).toBe(part.quantity)
        })
    )
}

function makeCheckoutList() {
    return new Promise<CartItem[]>(async (resolve)=>{
        // Search parts
        let search = await request("localhost:4001")
                .get(`/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
                .set("Authorization", KIOSK_TOKEN!)
            // Typecast
            let parts = search.body.parts as PartSchema[]
            let serializedCount = 0
            let unserializedCount = 0
            // Filter and map unserialized parts
            let cart = await Promise.all(parts.filter((p)=>p.quantity&&p.quantity>0).map(async (p)=>{
                // Part is unserialized - early return
                if(p.quantity&&p.quantity>0&&p.serialized!=true) {
                    unserializedCount++
                    return { nxid: p.nxid, quantity: p.quantity} as PartSchema
                }
                // Part is serialized - fetch serial numbers
                let res = await request('localhost:4001')
                    .get(`/api/partRecord/distinct?key=serial&where[nxid]=${p.nxid}&where[location]=Parts+Room&where[building]=3&where[next]=null`)
                    .set("Authorization", ADMIN_TOKEN!)
                expect(res.statusCode).toBe(200)
                // Typecast
                let serials = res.body as string[]
                // Expect length of all parts room serials to be the same as parts room quantity
                expect(serials.length).toBe(p.quantity)
                // Increment count
                serializedCount++
                // Return as serialized cart item
                return { nxid: p.nxid, serial: serials[0] } as CartItem  
            }))
            // Make sure serialized parts are in list
            expect(serializedCount).toBeGreaterThan(0)
            // Make sure unserialized parts are in list
            expect(unserializedCount).toBeGreaterThan(0)
            // Make sure data was pushed to cart
            expect(cart.length).toBeGreaterThan(0)
            // Resolve promise and return cart
            resolve(cart as CartItem[])
    })
}

// Making this a seperate function for specific cases
function makeSerializedCheckoutList() {
    return new Promise<CartItem[]>(async (resolve)=>{
        // Search parts
        let search = await request("localhost:4001")
                .get(`/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
                .set("Authorization", KIOSK_TOKEN!)
            // Typecast
            let parts = search.body.parts as PartSchema[]
            // Filter serialized parts
            let serialized = parts.filter((e)=>e.quantity&&e.quantity!>0&&e.serialized==true)
            // Fetch serials and map
            serialized = await Promise.all(serialized.map(async(p)=>{
                let res = await request('localhost:4001')
                    .get(`/api/partRecord/distinct?key=serial&where[nxid]=${p.nxid}&where[location]=Parts+Room&where[building]=3&where[next]=null`)
                    .set("Authorization", ADMIN_TOKEN!)
                expect(res.statusCode).toBe(200)
                let serials = res.body as string[]
                expect(serials.length).toBe(p.quantity)
                return { nxid: p.nxid, serial: serials[0] } as CartItem
            }))
            expect(serialized.length).toBeGreaterThan(0)
            // Join serialized and unserialized
            resolve(serialized as CartItem[])
    })
}
// Move parts and return requests as array
function movePart(parts: CartItem[], to: string, from: string, orderID?: string) {
    
    let transferListHash = new Map<string, InventoryEntry>()
    // Process transfer list
    parts.map((item)=> {
      // Create boilerplate
      let invEntry = { serials: [], unserialized: 0} as InventoryEntry
      // Check if it already exists in map
      if(transferListHash.has(item.nxid!))
        invEntry = transferListHash.get(item.nxid!)!
      // Update values
      if(item.serial)
        // Push serial to array
        invEntry.serials.push(item.serial)
      else
        // Increment unserialized
        invEntry.unserialized+= item.quantity!
      // Update hash
      transferListHash.set(item.nxid!, invEntry)
    })
    // Turn hash map back into array
    let partList = [] as InventoryEntry[]
    transferListHash.forEach((v, k)=>{
      v.nxid = k
      partList.push(v)
    })


    return request("localhost:4001")
        .post("/api/part/move")
        .set("Authorization", TECH_TOKEN!)
        .send({
            old_owner: from,
            new_owner: to,
            parts: partList,
            orderID
        })
}

// Return request for user inventory with token
function getUserInventory(token: string) {
    return request("localhost:4001")
        .get("/api/user/inventory")
        .set("Authorization", token)
}

// Search function with 0 results expected
const emptySearch = (token: string, text: string) => {
    request("localhost:4001")
        .get(`/api/part/search?searchString=${text}&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
        .set("Authorization", token)
        .then((search) => {
            expect(search.statusCode).toBe(200)
            expect(search.body.numParts).toBe(0)
            expect(search.body.numPages).toBe(0)
            expect(search.body.parts.length).toBe(0)
        })
}

// Search function with results expected
const textSearch = (token: string, query: string) => {
    request("localhost:4001")
        .get(`/api/part/search?searchString=${query}&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
        .set("Authorization", token)
        .then((search) => {
            expect(search.statusCode).toBe(200)
            expect(search.body.numParts).toBeGreaterThan(0)
            expect(search.body.numPages).toBeGreaterThan(0)
            expect(search.body.parts.length).toBeGreaterThan(0)
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
        expect(get1.body.total_quantity).toBeDefined()
        expect(get1.body.quantity).toBeDefined()
        
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
        expect(get2.body.parts[0].nxid).toBe(completePart.nxid)
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
        expect(get3.body.parts[0].total_quantity).toBe(5+completePart.quantity!)
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
    it("Check out as tech fails", async ()=>{
        // Generate checkout list
        let cart = await makeCheckoutList()
        expect(cart.length).toBeGreaterThan(0)
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", TECH_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(403)
    })
    it("Check out as admin fails", async ()=>{
        let cart = await makeCheckoutList()
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", ADMIN_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(403)
    })
    it("Check out as clerk fails", async ()=>{
        let cart = await makeCheckoutList()
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", INVENTORY_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(403)
    })
    it("Check out and check in parts", async ()=>{
        let cart = await makeCheckoutList()
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(200)
        // CHECK QUANTITY
        await checkIfCheckedOut(cart)
        // Check in parts
        let checkin = await request("localhost:4001")
            .post('/api/checkin')
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                inventory: cart
            })
        expect(checkin.statusCode).toBe(200)
        // Create parts list for checkin
        let checkInApprovalParts = cart.map((item)=>{
            if(item.serial)
                return { approved: true, nxid: item.nxid, serial: item.serial, newLocation: "Parts Room" }
            return { approved: true, nxid: item.nxid, quantity: item.quantity, approvedCount: item.quantity, newLocation: "Parts Room"}
        })
        // Get checkin queue
        let getCheckinQueue = await request("localhost:4001")
            .get('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
        expect(getCheckinQueue.statusCode).toBe(200)
        let queue = getCheckinQueue.body
        // Create request
        let checkInApprovalReq = {
            by: TECH_USER_ID,
            date: queue[0].date,
            parts: checkInApprovalParts
        }
        // Approve check in
        let checkinApproval = await request("localhost:4001")
            .post('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
            .send(checkInApprovalReq)
        expect(checkinApproval.statusCode).toBe(200)
        // CHECK QUANTITY
        checkIfCheckedIn(cart)
    }, 15000)
    it("Checkout serialized part without serial number fails",async () => {
        let search = await request("localhost:4001")
            .get(`/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
            .set("Authorization", KIOSK_TOKEN!)
        let parts = search.body.parts as PartSchema[]
        let cart = parts
            .filter((e)=>e.quantity&&e.quantity>0&&e.serialized==true)
            .map((p)=>{ return { nxid: p.nxid, quantity: p.quantity} as PartSchema})
        expect(cart.length).toBeGreaterThan(0)
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(400)
    })
    it("Checkout insufficient stock fails",async () => {
        let search = await request("localhost:4001")
            .get(`/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
            .set("Authorization", KIOSK_TOKEN!)
        let parts = search.body.parts as PartSchema[]
        let cart = parts
            .filter((e)=>e.quantity&&e.quantity>0&&e.serialized!=true)
            .map((p)=>{ return { nxid: p.nxid, quantity: p.quantity!*2} as PartSchema})
        expect(cart.length).toBeGreaterThan(0)
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(400)
    })
    it("Check out non existent serial fails",async () => {
        let search = await request("localhost:4001")
            .get(`/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
            .set("Authorization", KIOSK_TOKEN!)
        let parts = search.body.parts as PartSchema[]
        let cart = parts
            .filter((e)=>e.quantity&&e.quantity>0&&e.serialized==true)
            .map((p)=>{ return { nxid: p.nxid, serial: 'fakeandbrokenserialnumber1234'} as PartSchema})
        expect(cart.length).toBeGreaterThan(0)
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(400)
    })
    it("Check out duplicate serial does not fail",async () => {
        let cart = await makeSerializedCheckoutList()
        expect(cart.length).toBeGreaterThan(0)
        cart = cart.concat(cart)
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(200)
        // Create parts list for checkin
        let checkInApprovalParts = cart.map((item)=>{
            if(item.serial)
                return { approved: true, nxid: item.nxid, serial: item.serial, newLocation: "Parts Room" }
            return { approved: true, nxid: item.nxid, quantity: item.quantity, approvedCount: item.quantity, newLocation: "Parts Room"}
        })
        let failCheckin = await request("localhost:4001")
        .post('/api/checkin')
        .set("Authorization", KIOSK_TOKEN!)
        .send({
            user_id: TECH_USER_ID,
            inventory: cart
        })
        expect(failCheckin.statusCode).toBe(200)
        // Get checkin queue
        let getCheckinQueue = await request("localhost:4001")
            .get('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
        expect(getCheckinQueue.statusCode).toBe(200)
        let queue = getCheckinQueue.body
        // Create request
        let checkInApprovalReq = {
            by: TECH_USER_ID,
            date: queue[0].date,
            parts: checkInApprovalParts
        }
        // Approve check in
        let checkinApproval = await request("localhost:4001")
            .post('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
            .send(checkInApprovalReq)
        expect(checkinApproval.statusCode).toBe(200)
        // CHECK QUANTITY
        checkIfCheckedIn(cart)
    })
})

describe("Checkin", ()=>{
    it("Check in parts not in users inventory", async()=>{
        let cart = await makeCheckoutList()
        let checkin = await request("localhost:4001")
        .post('/api/checkin')
        .set("Authorization", KIOSK_TOKEN!)
        .send({
            user_id: TECH_USER_ID,
            inventory: cart
        })
        expect(checkin.statusCode).toBe(400)
    })
    it("Check in duplicate serial does not fail.", async() => {
        let cart = await makeSerializedCheckoutList()
        expect(cart.length).toBeGreaterThan(0)
        // Check out serialized parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(200)
        // Duplicate serials
        let duplicateCart = cart.concat(cart)
        // Fail check in
        let failCheckin = await request("localhost:4001")
        .post('/api/checkin')
        .set("Authorization", KIOSK_TOKEN!)
        .send({
            user_id: TECH_USER_ID,
            inventory: duplicateCart
        })
        expect(failCheckin.statusCode).toBe(200)

        // Create parts list for checkin
        let checkInApprovalParts = cart.map((item)=>{
            if(item.serial)
                return { approved: true, nxid: item.nxid, serial: item.serial, newLocation: "Parts Room" }
            return { approved: true, nxid: item.nxid, quantity: item.quantity, approvedCount: item.quantity, newLocation: "Parts Room"}
        })
        // Get checkin queue
        let getCheckinQueue = await request("localhost:4001")
            .get('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
        expect(getCheckinQueue.statusCode).toBe(200)
        let queue = getCheckinQueue.body
        // Create request
        let checkInApprovalReq = {
            by: TECH_USER_ID,
            date: queue[0].date,
            parts: checkInApprovalParts
        }
        // Approve check in
        let checkinApproval = await request("localhost:4001")
            .post('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
            .send(checkInApprovalReq)
        expect(checkinApproval.statusCode).toBe(200)
        // CHECK QUANTITY
        checkIfCheckedIn(cart)
        // Real check in
        // let checkin = await request("localhost:4001")
        // .post('/api/checkin')
        // .set("Authorization", KIOSK_TOKEN!)
        // .send({
        //     user_id: TECH_USER_ID,
        //     inventory: cart
        // })
        // expect(checkin.statusCode).toBe(200)
    })
    it("Check in serialized without serial fails", async() => {
        let cart = await makeSerializedCheckoutList() 
        expect(cart.length).toBeGreaterThan(0)
        // Check out serialized parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(200)
        
        let badCart = cart 
            .map((p)=>{ return { nxid: p.nxid, quantity: 1} as CartItem})
        let failCheckin = await request("localhost:4001")
        .post('/api/checkin')
        .set("Authorization", KIOSK_TOKEN!)
        .send({
            user_id: TECH_USER_ID,
            inventory: badCart
        })
        expect(failCheckin.statusCode).toBe(400)

        // Real check in
        let checkin = await request("localhost:4001")
        .post('/api/checkin')
        .set("Authorization", KIOSK_TOKEN!)
        .send({
            user_id: TECH_USER_ID,
            inventory: cart
        })
        expect(checkin.statusCode).toBe(200)


        // Create parts list for checkin
        let checkInApprovalParts = cart.map((item)=>{
            if(item.serial)
                return { approved: true, nxid: item.nxid, serial: item.serial, newLocation: "Parts Room" }
            return { approved: true, nxid: item.nxid, quantity: item.quantity, approvedCount: item.quantity, newLocation: "Parts Room"}
        })
        // Get checkin queue
        let getCheckinQueue = await request("localhost:4001")
            .get('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
        expect(getCheckinQueue.statusCode).toBe(200)
        let queue = getCheckinQueue.body
        // Create request
        let checkInApprovalReq = {
            by: TECH_USER_ID,
            date: queue[0].date,
            parts: checkInApprovalParts
        }
        // Approve check in
        let checkinApproval = await request("localhost:4001")
            .post('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
            .send(checkInApprovalReq)
        expect(checkinApproval.statusCode).toBe(200)
        // CHECK QUANTITY
        checkIfCheckedIn(cart)
    })
    it("Check in parts as different user fails", async ()=>{
        let cart = await makeCheckoutList()
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(200)
        // CHECK QUANTITY
        await checkIfCheckedOut(cart)

        let failCheckin = await request("localhost:4001")
            .post('/api/checkin')
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: CLERK_USER_ID,
                inventory: cart
            })
        expect(failCheckin.statusCode).toBe(400)
        // Check in parts
        let checkin = await request("localhost:4001")
            .post('/api/checkin')
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                inventory: cart
            })
        expect(checkin.statusCode).toBe(200)

        // Create parts list for checkin
        let checkInApprovalParts = cart.map((item)=>{
            if(item.serial)
                return { approved: true, nxid: item.nxid, serial: item.serial, newLocation: "Parts Room" }
            return { approved: true, nxid: item.nxid, quantity: item.quantity, approvedCount: item.quantity, newLocation: "Parts Room"}
        })
        // Get checkin queue
        let getCheckinQueue = await request("localhost:4001")
            .get('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
        expect(getCheckinQueue.statusCode).toBe(200)
        let queue = getCheckinQueue.body
        // Create request
        let checkInApprovalReq = {
            by: TECH_USER_ID,
            date: queue[0].date,
            parts: checkInApprovalParts
        }
        // Approve check in
        let checkinApproval = await request("localhost:4001")
            .post('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
            .send(checkInApprovalReq)
        expect(checkinApproval.statusCode).toBe(200)
        // CHECK QUANTITY
        checkIfCheckedIn(cart)
    })
})

describe("Move parts", ()=>{
    let allTechs = 'all'
    let testing = 'testing'
    let techInventory = TECH_USER_ID
    let adminInventory = ADMIN_USER_ID
    let clerkInventory = CLERK_USER_ID
    let kioskInventory = KIOSK_USER_ID
    let salesInventory = SALES_USER_ID
    it('Move from tech to all techs', async () => {
        // Search parts
        let search = await request("localhost:4001")
            .get(`/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
            .set("Authorization", KIOSK_TOKEN!)
        let parts = search.body.parts as PartSchema[]
        // Filter and map unserialized parts
        let cart = parts
            .filter((e)=>e.quantity&&e.quantity!>0&&e.serialized!=true)
            .map((p)=>{ return { nxid: p.nxid, quantity: p.quantity} as CartItem})
        expect(cart.length).toBeGreaterThan(0)
        // Filter serialized parts
        parts = parts.filter((e)=>e.quantity&&e.quantity!>0&&e.serialized==true)
        // Fetch serials and map
        let serialized = await Promise.all(parts.map(async(p)=>{
            let res = await request('localhost:4001')
                .get(`/api/partRecord/distinct?key=serial&where[nxid]=${p.nxid}&where[location]=Parts+Room&where[building]=3&where[next]=null`)
                .set("Authorization", ADMIN_TOKEN!)
            expect(res.statusCode).toBe(200)
            let serials = res.body as string[]
            expect(serials.length).toBe(p.quantity)
            return { nxid: p.nxid, serial: serials[0] } as CartItem
        }))
        expect(serialized.length).toBeGreaterThan(0)
        // Join serialized and unserialized
        cart = cart.concat(serialized)
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(200)
        // CHECK QUANTITY
        // Move parts to all techs 
        let move = await movePart(cart, allTechs, techInventory)
        // Check moves
        expect(move.statusCode).toBe(200)
        // expect(m.statusCode).toBe(200)
        // Check quantities
        let techInv = await getUserInventory(TECH_TOKEN!)
        expect(techInv.statusCode).toBe(200)
        // Move back
        let moveBack = await movePart(cart, techInventory, allTechs)
        // Check moves
        expect(moveBack.statusCode).toBe(200)
        // Check quantities
        
        // Check in parts
        let checkin = await request("localhost:4001")
            .post('/api/checkin')
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: TECH_USER_ID,
                inventory: cart
            })
        expect(checkin.statusCode).toBe(200)
        // Create parts list for checkin
        let checkInApprovalParts = cart.map((item)=>{
            if(item.serial)
                return { approved: true, nxid: item.nxid, serial: item.serial, newLocation: "Parts Room" }
            return { approved: true, nxid: item.nxid, quantity: item.quantity, approvedCount: item.quantity, newLocation: "Parts Room"}
        })
        // Get checkin queue
        let getCheckinQueue = await request("localhost:4001")
            .get('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
        expect(getCheckinQueue.statusCode).toBe(200)
        let queue = getCheckinQueue.body
        // Create request
        let checkInApprovalReq = {
            by: TECH_USER_ID,
            date: queue[0].date,
            parts: checkInApprovalParts
        }
        // Approve check in
        let checkinApproval = await request("localhost:4001")
            .post('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
            .send(checkInApprovalReq)
        expect(checkinApproval.statusCode).toBe(200)
        // CHECK QUANTITY
        await checkIfCheckedIn(cart)
    })
    it('Move from clerk to all techs', async () => {
        // Search parts
        let search = await request("localhost:4001")
            .get(`/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
            .set("Authorization", KIOSK_TOKEN!)
        let parts = search.body.parts as PartSchema[]
        // Filter and map unserialized parts
        let cart = parts
            .filter((e)=>e.quantity&&e.quantity!>0&&e.serialized!=true)
            .map((p)=>{ return { nxid: p.nxid, quantity: p.quantity} as CartItem})
        expect(cart.length).toBeGreaterThan(0)
        // Filter serialized parts
        parts = parts.filter((e)=>e.quantity&&e.quantity!>0&&e.serialized==true)
        // Fetch serials and map
        let serialized = await Promise.all(parts.map(async(p)=>{
            let res = await request('localhost:4001')
                .get(`/api/partRecord/distinct?key=serial&where[nxid]=${p.nxid}&where[location]=Parts+Room&where[building]=3&where[next]=null`)
                .set("Authorization", ADMIN_TOKEN!)
            expect(res.statusCode).toBe(200)
            let serials = res.body as string[]
            expect(serials.length).toBe(p.quantity)
            return { nxid: p.nxid, serial: serials[0] } as CartItem
        }))
        expect(serialized.length).toBeGreaterThan(0)
        // Join serialized and unserialized
        cart = cart.concat(serialized)
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: CLERK_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(200)
        // CHECK QUANTITY
        // Move parts to all techs 
        let move = await movePart(cart, allTechs, clerkInventory)
        // Check moves
        expect(move.statusCode).toBe(200)
        // expect(m.statusCode).toBe(200)
        // Check quantities
        let clerkInv = await getUserInventory(INVENTORY_TOKEN!)
        expect(clerkInv.statusCode).toBe(200)
        // Move back
        let moveBack = await movePart(cart, clerkInventory, allTechs)
        // Check moves
        expect(moveBack.statusCode).toBe(200)
        // Check quantities
        
        // Check in parts
        let checkin = await request("localhost:4001")
            .post('/api/checkin')
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: CLERK_USER_ID,
                inventory: cart
            })
        expect(checkin.statusCode).toBe(200)
        // Create parts list for checkin
        let checkInApprovalParts = cart.map((item)=>{
            if(item.serial)
                return { approved: true, nxid: item.nxid, serial: item.serial, newLocation: "Parts Room" }
            return { approved: true, nxid: item.nxid, quantity: item.quantity, approvedCount: item.quantity, newLocation: "Parts Room"}
        })
        // Get checkin queue
        let getCheckinQueue = await request("localhost:4001")
            .get('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
        expect(getCheckinQueue.statusCode).toBe(200)
        let queue = getCheckinQueue.body
        // Create request
        let checkInApprovalReq = {
            by: CLERK_USER_ID,
            date: queue[0].date,
            parts: checkInApprovalParts
        }
        // Approve check in
        let checkinApproval = await request("localhost:4001")
            .post('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
            .send(checkInApprovalReq)
        expect(checkinApproval.statusCode).toBe(200)
        // CHECK QUANTITY
        await checkIfCheckedIn(cart)
    })
    it('Move from admin to all techs', async () => {
        // Search parts
        let search = await request("localhost:4001")
            .get(`/api/part/search?searchString=&pageNum=1&pageSize=50&building=3&location=Parts+Room`)
            .set("Authorization", KIOSK_TOKEN!)
        let parts = search.body.parts as PartSchema[]
        // Filter and map unserialized parts
        let cart = parts
            .filter((e)=>e.quantity&&e.quantity!>0&&e.serialized!=true)
            .map((p)=>{ return { nxid: p.nxid, quantity: p.quantity} as CartItem})
        expect(cart.length).toBeGreaterThan(0)
        // Filter serialized parts
        parts = parts.filter((e)=>e.quantity&&e.quantity!>0&&e.serialized==true)
        // Fetch serials and map
        let serialized = await Promise.all(parts.map(async(p)=>{
            let res = await request('localhost:4001')
                .get(`/api/partRecord/distinct?key=serial&where[nxid]=${p.nxid}&where[location]=Parts+Room&where[building]=3&where[next]=null`)
                .set("Authorization", ADMIN_TOKEN!)
            expect(res.statusCode).toBe(200)
            let serials = res.body as string[]
            expect(serials.length).toBe(p.quantity)
            return { nxid: p.nxid, serial: serials[0] } as CartItem
        }))
        expect(serialized.length).toBeGreaterThan(0)
        // Join serialized and unserialized
        cart = cart.concat(serialized)
        // Check out parts
        let checkout = await request("localhost:4001")
            .post(`/api/checkout`)
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: ADMIN_USER_ID,
                cart: cart
            })
        expect(checkout.statusCode).toBe(200)
        // CHECK QUANTITY
        // Move parts to all techs 
        let move = await movePart(cart, allTechs, adminInventory)
        // Check moves
        expect(move.statusCode).toBe(200)
        // expect(m.statusCode).toBe(200)
        // Check quantities
        let adminInv = await getUserInventory(ADMIN_TOKEN!)
        expect(adminInv.statusCode).toBe(200)
        // Move back
        let moveBack = await movePart(cart, adminInventory, allTechs)
        // Check moves
        expect(moveBack.statusCode).toBe(200)
        // Check quantities
        
        // Check in parts
        let checkin = await request("localhost:4001")
            .post('/api/checkin')
            .set("Authorization", KIOSK_TOKEN!)
            .send({
                user_id: ADMIN_USER_ID,
                inventory: cart
            })
        expect(checkin.statusCode).toBe(200)
        // Create parts list for checkin
        let checkInApprovalParts = cart.map((item)=>{
            if(item.serial)
                return { approved: true, nxid: item.nxid, serial: item.serial, newLocation: "Parts Room" }
            return { approved: true, nxid: item.nxid, quantity: item.quantity, approvedCount: item.quantity, newLocation: "Parts Room"}
        })
        // Get checkin queue
        let getCheckinQueue = await request("localhost:4001")
            .get('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
        expect(getCheckinQueue.statusCode).toBe(200)
        let queue = getCheckinQueue.body
        // Create request
        let checkInApprovalReq = {
            by: ADMIN_USER_ID,
            date: queue[0].date,
            parts: checkInApprovalParts
        }
        // Approve check in
        let checkinApproval = await request("localhost:4001")
            .post('/api/checkin/queue')
            .set("Authorization", ADMIN_TOKEN!)
            .send(checkInApprovalReq)
        expect(checkinApproval.statusCode).toBe(200)
        // CHECK QUANTITY
        await checkIfCheckedIn(cart)
    })
})
// Get distinct on part records

// Get distinct on part info

// Move part records

// Move between user and all techs

// Tech cannot transfer to another tech

// Tech cannot move parts out of testing

// Integer and booleans breaking advanced search
