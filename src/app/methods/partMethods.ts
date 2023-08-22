import { PartQuery } from "../interfaces.js"

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
