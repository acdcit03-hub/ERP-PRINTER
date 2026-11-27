export default function createOrderController(orderStore) {
  return {
    list(req, res) {
      res.json({ orders: orderStore.list() });
    },
  };
}
