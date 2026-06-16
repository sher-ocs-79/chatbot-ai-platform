<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Admin\DashboardController;
use App\Http\Controllers\Admin\SettingsController;
use App\Http\Controllers\Admin\ExtractionController;
use Illuminate\Support\Facades\Route;

Route::get('/login', [LoginController::class, 'showForm'])->name('login');
Route::post('/login', [LoginController::class, 'login']);
Route::post('/logout', [LoginController::class, 'logout'])->name('logout');

Route::middleware('auth')->prefix('admin')->name('admin.')->group(function () {
    Route::get('/', [DashboardController::class, 'index'])->name('dashboard');

    Route::get('/settings', [SettingsController::class, 'index'])->name('settings');
    Route::post('/settings', [SettingsController::class, 'update'])->name('settings.update');

    Route::get('/extractions', [ExtractionController::class, 'index'])->name('extractions.index');
    Route::post('/extractions/run', [ExtractionController::class, 'run'])->name('extractions.run');
    Route::get('/extractions/view/{type}/{filename}', [ExtractionController::class, 'view'])
        ->where('type', 'posts|pages')
        ->name('extractions.view');
    Route::delete('/extractions/{type}/{filename}', [ExtractionController::class, 'delete'])
        ->where('type', 'posts|pages')
        ->name('extractions.delete');
    Route::post('/extractions/clear', [ExtractionController::class, 'clear'])->name('extractions.clear');
});

Route::redirect('/', '/admin');
