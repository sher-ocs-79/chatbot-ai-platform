<?php

namespace App\Services;

use App\Models\Setting;
use RuntimeException;

class WordPressExtractorService
{
    private string $siteUrl;
    private int $perPage;
    private ?string $authUser;
    private ?string $authPass;

    public function __construct()
    {
        $this->siteUrl  = rtrim(Setting::get('wp_site_url', ''), '/');
        $this->perPage  = (int) Setting::get('wp_per_page', 100);
        $this->authUser = Setting::get('wp_auth_user') ?: null;
        $this->authPass = Setting::get('wp_auth_password') ?: null;
    }

    /**
     * Extract all posts or pages from the WordPress REST API.
     *
     * @param string $type 'posts' or 'pages'
     * @return array{saved: int, ids: int[]}
     */
    public function extract(string $type): array
    {
        if (empty($this->siteUrl)) {
            throw new RuntimeException('WordPress site URL is not configured.');
        }

        $context    = $this->buildStreamContext();
        $totalPages = 1;
        $savedIds   = [];

        for ($page = 1; $page <= $totalPages; $page++) {
            $url      = "{$this->siteUrl}/wp-json/wp/v2/{$type}?per_page={$this->perPage}&page={$page}";
            $response = @file_get_contents($url, false, $context);

            if ($response === false) {
                throw new RuntimeException("Failed to fetch {$type} from: {$url}");
            }

            // Parse total pages header on the first request
            if ($page === 1 && isset($http_response_header)) {
                foreach ($http_response_header as $header) {
                    if (stripos($header, 'X-WP-TotalPages:') === 0) {
                        $totalPages = (int) trim(explode(':', $header, 2)[1]);
                        break;
                    }
                }
            }

            $items = json_decode($response, true);

            if (empty($items)) {
                break;
            }

            foreach ($items as $item) {
                $this->saveItem($item, $type);
                $savedIds[] = (int) $item['id'];
            }
        }

        return ['saved' => count($savedIds), 'ids' => $savedIds];
    }

    private function buildStreamContext(): mixed
    {
        $headers = ['Accept: application/json'];

        if ($this->authUser && $this->authPass) {
            $headers[] = 'Authorization: Basic ' . base64_encode("{$this->authUser}:{$this->authPass}");
        }

        return stream_context_create([
            'http' => [
                'method'  => 'GET',
                'header'  => implode("\r\n", $headers),
                'timeout' => 30,
            ],
            'ssl' => [
                'verify_peer'      => true,
                'verify_peer_name' => true,
            ],
        ]);
    }

    private function saveItem(array $item, string $type): void
    {
        $id   = $item['id'];
        $slug = $item['slug'] ?? $id;
        $dir  = storage_path("app/extractions/{$type}");

        if (!is_dir($dir)) {
            mkdir($dir, 0755, true);
        }

        file_put_contents("{$dir}/{$id}-{$slug}.txt", $this->formatItem($item));
    }

    private function formatItem(array $item): string
    {
        $title    = strip_tags($item['title']['rendered'] ?? '');
        $content  = strip_tags(html_entity_decode($item['content']['rendered'] ?? '', ENT_QUOTES | ENT_HTML5));
        $excerpt  = strip_tags(html_entity_decode($item['excerpt']['rendered'] ?? '', ENT_QUOTES | ENT_HTML5));
        $date     = $item['date'] ?? '';
        $modified = $item['modified'] ?? '';
        $status   = $item['status'] ?? '';
        $link     = $item['link'] ?? '';
        $slug     = $item['slug'] ?? '';
        $author   = $item['author'] ?? '';

        $lines = [
            "ID:       {$item['id']}",
            "Title:    {$title}",
            "Slug:     {$slug}",
            "Status:   {$status}",
            "Author:   {$author}",
            "Date:     {$date}",
            "Modified: {$modified}",
            "Link:     {$link}",
            '',
            str_repeat('-', 60),
            'CONTENT',
            str_repeat('-', 60),
            '',
            trim($content),
            '',
            str_repeat('-', 60),
            'EXCERPT',
            str_repeat('-', 60),
            '',
            trim($excerpt),
        ];

        return implode("\n", $lines) . "\n";
    }
}
