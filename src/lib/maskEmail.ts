/** "jhonatan@gmail.com" -> "j*******@gmail.com": the first letter and the domain stay, the rest of the name is hidden (a short name shows only its first letter and three stars). */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return email.length > 1 ? `${email[0]}***` : '***';
  const name = email.slice(0, at);
  const domain = email.slice(at);
  const hidden = Math.min(Math.max(name.length - 1, 3), 8);
  return `${name[0]}${'*'.repeat(hidden)}${domain}`;
}
