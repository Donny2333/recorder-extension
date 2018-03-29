const express = require('express')
const router = express.Router()
const handler = require('../controller').handler

router.get('/topN/:metric/:num', handler.topN)

module.exports = router
