const ORDERS = [
  { id:'o1', status:'PAID', total:120 },
  { id:'o2', status:'PENDING', total:80 },
  { id:'o3', status:'PAID', total:200 },
  { id:'o4', status:'CANCELED', total:50 },
  { id:'o5', status:'PAID', total:40 },
];

export function listOrders({ status } = {}) {
  return status ? ORDERS.filter(o => o.status === status) : [...ORDERS];
}
