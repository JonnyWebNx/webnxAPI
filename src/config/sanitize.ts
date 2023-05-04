export function stringSanitize(text: string, strict: boolean) {
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
            .replaceAll('/', '')
            .replaceAll('*', '')
            .replaceAll('.', '')
    return text
}

export function objectSanitize(obj: Object, strict: boolean) {
    let copy = JSON.parse(JSON.stringify(obj))
    for(let v in copy) {
        if (typeof(copy[v])=='string')
            copy[v] = stringSanitize(copy[v] as string, strict)
        else if (typeof(copy[v])=='object')
            copy[v] = objectSanitize(copy[v], strict)
    }
    return copy
}