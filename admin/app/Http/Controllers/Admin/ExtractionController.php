<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\WordPressExtractorService;
use Illuminate\Http\Request;

class ExtractionController extends Controller
{
    public function index()
    {
        $files = $this->listFiles();
        return view('admin.extractions.index', compact('files'));
    }

    public function run(Request $request)
    {
        $request->validate([
            'type' => ['required', 'in:posts,pages,both'],
        ]);

        set_time_limit(300);

        try {
            $service = new WordPressExtractorService();
            $results = [];

            $types = $request->type === 'both' ? ['posts', 'pages'] : [$request->type];

            foreach ($types as $type) {
                $enabled = Setting::get("wp_extract_{$type}", '1');
                if ($enabled === '0') {
                    continue;
                }
                $result = $service->extract($type);
                $results[] = "Extracted {$result['saved']} {$type}.";
            }

            $message = implode(' ', $results) ?: 'No content types selected for extraction.';
            return back()->with('success', $message);
        } catch (\Throwable $e) {
            return back()->with('error', 'Extraction failed: ' . $e->getMessage());
        }
    }

    public function view(string $type, string $filename)
    {
        $filename = basename($filename);
        $path     = storage_path("app/extractions/{$type}/{$filename}");

        if (!file_exists($path)) {
            abort(404);
        }

        $content = file_get_contents($path);
        return view('admin.extractions.view', compact('type', 'filename', 'content'));
    }

    public function delete(string $type, string $filename)
    {
        $filename = basename($filename);
        $path     = storage_path("app/extractions/{$type}/{$filename}");

        if (file_exists($path)) {
            unlink($path);
        }

        return redirect()->route('admin.extractions.index')->with('success', "Deleted: {$filename}");
    }

    public function clear(Request $request)
    {
        $type = $request->input('type', 'all');

        $dirs = $type === 'all'
            ? ['posts', 'pages']
            : [$type];

        foreach ($dirs as $dir) {
            $path = storage_path("app/extractions/{$dir}");
            if (is_dir($path)) {
                array_map('unlink', glob("{$path}/*.txt"));
            }
        }

        return back()->with('success', 'Extractions cleared.');
    }

    private function listFiles(): array
    {
        $result = ['posts' => [], 'pages' => []];

        foreach (array_keys($result) as $type) {
            $dir = storage_path("app/extractions/{$type}");
            if (!is_dir($dir)) {
                continue;
            }
            foreach (glob("{$dir}/*.txt") as $file) {
                $result[$type][] = [
                    'name'     => basename($file),
                    'size'     => filesize($file),
                    'modified' => filemtime($file),
                ];
            }
            usort($result[$type], fn ($a, $b) => $b['modified'] - $a['modified']);
        }

        return $result;
    }
}
