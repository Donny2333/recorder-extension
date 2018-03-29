const topN = (req, res) => {
  res.json({
    title: 'monitor',
    body: 'topN',
    metric: req.params.metric,
    num: req.params.num
  })
}

module.exports = {
  topN
}
