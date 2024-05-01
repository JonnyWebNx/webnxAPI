import { Request } from "express";
import { DEFAULT_PAGE_SIZE } from "../Constants.js";
import { PartQuery } from "../interfaces.js";
import { stringSanitize } from "../util/sanitize.js";
export function getPageNumAndSize(req: Request) {
    // Parse from query string
    let pageNum = parseInt(req.query.pageNum as string)
    let pageSize = parseInt(req.query.pageSize as string)
    // If NaN, default to 20 per page
    if(isNaN(pageSize))
        pageSize = DEFAULT_PAGE_SIZE
    // If NaN, default to page 1
    if(isNaN(pageNum))
        pageNum = 1
    let pageSkip = pageSize * (pageNum - 1)
    // Return parsed ints
    return { pageNum, pageSize, pageSkip }
}

export function getSearchSort(req: Request) {
    let sortBy = req.query.sortString as string
    let sortDir = parseInt(req.query.sortDir as string)
    let sort = { relevance: -1 } as any
    if(sortBy) {
        if(!(sortDir==1||sortDir==-1)) {
            sortDir = 1
        }
        sort = {}
        sort[sortBy] = sortDir
    }
    return sort
}

export function getSearchString(req: Request) {
    let searchString = req.query.searchString as string
    if(searchString==undefined||(typeof(searchString)!="string"))
        searchString = ""
    return stringSanitize(searchString, true)
}

export function getTextSearchParams(req: Request) {
    // Parse from query string
    let { pageNum, pageSize, pageSkip } = getPageNumAndSize(req)
    let searchString = getSearchString(req)
    let sort = getSearchSort(req)
    // Return parsed ints
    return { pageNum, pageSize, searchString, pageSkip, sort }
}

export function getStartAndEndDate(req: Request) {
    // Parse integers
    let startDateInt = parseInt(req.query.startDate as string)
    let endDateInt = parseInt(req.query.endDate as string)
    // Init dates
    let startDateParsed = new Date(startDateInt)
    let endDateParsed = new Date(endDateInt)
    // If NaN, use todatys date
    if(isNaN(startDateInt))
        startDateParsed = new Date((new Date()).toLocaleDateString())
    if(isNaN(endDateInt))
        endDateParsed = new Date((new Date()).toLocaleDateString())
    // Add 1 to end date
    endDateParsed.setDate(endDateParsed.getDate()+1)
    // return
    return { startDate: startDateParsed, endDate: endDateParsed }
}

export function getNumPages(pageSize: number, numElements: number) {
    return numElements%pageSize>0 ? Math.trunc(numElements/pageSize) + 1 : Math.trunc(numElements/pageSize)
}

export function objectToRegex(obj: any) {
    let regexObject = {} as PartQuery
    Object.keys(obj).forEach((k)=>{
        // early return for empty strings
        if(obj[k]=='')
            return
        // ALlow array partial matches
        if(Array.isArray(obj[k])&&!(obj[k]!.length==0)) {
            // Generate regex for each array field
            let arr = (obj[k] as string[]).map((v)=>{
                return new RegExp(v, "i") 
            })
            // Use $all with array of case insensitive regexes
            return regexObject[k] = { $all: arr }
        }
        // Check if value is integer
        if(typeof(obj[k])=='string'&&!isNaN(obj[k] as any)) {
            // Parse integer
            return regexObject[k] = parseFloat(obj[k] as string)
        }
        // Check if not boolean 
        if(!(obj[k]=='true')&&!(obj[k]=='false'))
            // Create case insensitive regex
            return regexObject[k] = { $regex: obj[k], $options: 'i' } 
        // Any value here is likely a boolean
        regexObject[k] = obj[k]
    })
    return regexObject
}
