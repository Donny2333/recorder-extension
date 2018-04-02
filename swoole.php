<?php

define('_ROOT_', dirname(__FILE__));

$server = new swoole_websocket_server('0.0.0.0', 8888);

$server->on('open', function (swoole_websocket_server $server, $request) {
    $client = _ROOT_ . '/client/' . $request->fd . '.client';
    if (!file_exists($client)) {
        @file_put_contents($client, $request->fd);
    }
});

$server->on('message', function (swoole_websocket_server $server, $frame) {
    foreach (notice(_ROOT_ . '/client/') as $v) {
        $server->push($v, $frame->data);
    }
});

$server->on('close', function ($server, $fd) {
    @unlink(_ROOT_ . '/client/' . $fd . '.client');
});

$server->start();
