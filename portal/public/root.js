// The root address (/ or /?ref=CODE) sends the visitor to the language page and keeps the query and hash, so an invite link keeps its code.
const lang = /^pt/i.test(navigator.language || '') ? 'pt' : 'en';
location.replace('/' + lang + '/' + location.search + location.hash);
