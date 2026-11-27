export default function createPrinterController(printerCache) {
  return {
    list(req, res) {
      const data = printerCache.list();
      res.json(data);
    },

    options(req, res) {
      res.json({
        options: [],
        paper: [],
        printer: req.query.printer || null,
      });
    },
  };
}
