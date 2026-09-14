export function formatPlacedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const utc = date.toISOString();
  return `${utc.slice(0, 10)} ${utc.slice(11, 16)} UTC`;
}

export function formatOrderAddress(address: {
  firstName: string;
  lastName: string;
  streetName: string;
  additionalStreetInfo?: string;
  postalCode: string;
  city: string;
  country: string;
}): string {
  return [
    `${address.firstName} ${address.lastName}`,
    address.streetName,
    address.additionalStreetInfo,
    `${address.postalCode} ${address.city}`,
    address.country,
  ]
    .filter(Boolean)
    .join(", ");
}

export function orderHref(orderStatusHref: string, orderNumber: string): string {
  const separator = orderStatusHref.includes("?") ? "&" : "?";
  return `${orderStatusHref}${separator}orderNumber=${encodeURIComponent(orderNumber)}`;
}
