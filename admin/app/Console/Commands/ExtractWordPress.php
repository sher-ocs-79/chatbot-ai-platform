<?php

namespace App\Console\Commands;

use App\Models\Setting;
use App\Services\WordPressExtractorService;
use Illuminate\Console\Command;

class ExtractWordPress extends Command
{
    protected $signature   = 'wp:extract {--type=both : posts, pages, or both}';
    protected $description = 'Extract WordPress posts and/or pages to .txt files';

    public function handle(): int
    {
        $type    = $this->option('type');
        $types   = $type === 'both' ? ['posts', 'pages'] : [$type];
        $service = new WordPressExtractorService();

        foreach ($types as $t) {
            $enabled = Setting::get("wp_extract_{$t}", '1');
            if ($enabled === '0') {
                $this->warn("Skipping {$t} (disabled in settings).");
                continue;
            }

            $this->info("Extracting {$t}...");

            try {
                $result = $service->extract($t);
                $this->info("  Saved {$result['saved']} {$t}.");
            } catch (\Throwable $e) {
                $this->error("  Failed: " . $e->getMessage());
                return self::FAILURE;
            }
        }

        $this->info('Done.');
        return self::SUCCESS;
    }
}
