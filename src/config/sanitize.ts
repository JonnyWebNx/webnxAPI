// Remove all characters that are associated with MongoDB commands or could escape a query
export function stringSanitize(text: string, strict: boolean) {
    if(text==undefined)
        return text
    text =  text
        .replaceAll("\\", "")
        .replaceAll("$", "")
        .replaceAll('[', '')
        .replaceAll(']', '')
        .replaceAll('{', '')
        .replaceAll('}', '')
        .replaceAll('=', '')
        .replaceAll('%', '')
        // .replaceAll('"', '&quot;')
        // .replaceAll("'", '&apos;')
        // .replaceAll('&', '&amp;')
        // .replaceAll('<', '&lt;')
        // .replaceAll('>', '&gt;')
        .replaceAll('^', '')
    if (strict)
        text = text
            .replaceAll('(', '')
            .replaceAll(')', '')
            .replaceAll('+', '')
            .replaceAll('|', '')
            .replaceAll('/', ' ')
            .replaceAll('*', '')
            // .replaceAll('.', '')
    return text
}
// Recursively sanitize strings inside of objects
export function objectSanitize(obj: Object, strict: boolean) {
    // Make copy of object
    let copy = JSON.parse(JSON.stringify(obj))
    // For every value
    for(let v in copy) {
        // Check if string
        if (typeof(copy[v])=='string')
            // Use string sanitize
            copy[v] = stringSanitize(copy[v] as string, strict)
        // If object
        else if (typeof(copy[v])=='object')
            // Recursively sanitize object
            copy[v] = objectSanitize(copy[v], strict)
    }
    return copy
}
