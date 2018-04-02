<?php

print_r($_POST);
print_r($_FILES);
foreach (['video', 'audio'] as $type) {
    if (isset($_FILES["${type}-blob"])) {
        $fileName = '1.blob';
        $filePath = 'uploads/' . $fileName;
        file_put_contents(file_get_contents($_FILES["${type}-blob"]['tmp_name']), FILE_APPEND);
    }
}
