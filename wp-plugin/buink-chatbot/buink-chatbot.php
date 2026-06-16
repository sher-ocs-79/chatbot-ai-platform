<?php
/**
 * Plugin Name: Buink Chatbot Widget
 * Plugin URI:  https://buink.co
 * Description: Embeds the Buink AI chatbot as a floating iframe widget on every page. Configure the widget URL, server URL and API key in Settings → Buink Chatbot.
 * Version:     1.0.0
 * Author:      Buink
 * License:     GPL-2.0-or-later
 * Text Domain: buink-chatbot
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

define( 'BUINK_CHATBOT_VERSION', '1.0.0' );
define( 'BUINK_CHATBOT_DIR', plugin_dir_path( __FILE__ ) );
define( 'BUINK_CHATBOT_URL', plugin_dir_url( __FILE__ ) );

// ── Admin ─────────────────────────────────────────────────────────────────────

add_action( 'admin_menu', 'buink_chatbot_admin_menu' );
function buink_chatbot_admin_menu(): void {
    add_options_page(
        __( 'Buink Chatbot', 'buink-chatbot' ),
        __( 'Buink Chatbot', 'buink-chatbot' ),
        'manage_options',
        'buink-chatbot',
        'buink_chatbot_settings_page'
    );
}

add_action( 'admin_init', 'buink_chatbot_register_settings' );
function buink_chatbot_register_settings(): void {
    register_setting( 'buink_chatbot_options', 'buink_chatbot_widget_url', [
        'type'              => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default'           => '',
    ] );

    register_setting( 'buink_chatbot_options', 'buink_chatbot_server_url', [
        'type'              => 'string',
        'sanitize_callback' => 'esc_url_raw',
        'default'           => '',
    ] );

    register_setting( 'buink_chatbot_options', 'buink_chatbot_api_key', [
        'type'              => 'string',
        'sanitize_callback' => 'sanitize_text_field',
        'default'           => '',
    ] );

    add_settings_section( 'buink_chatbot_main', __( 'Widget Settings', 'buink-chatbot' ), '__return_false', 'buink-chatbot' );

    add_settings_field( 'buink_chatbot_widget_url', __( 'Widget URL', 'buink-chatbot' ),  'buink_chatbot_field_widget_url',  'buink-chatbot', 'buink_chatbot_main' );
    add_settings_field( 'buink_chatbot_server_url', __( 'SERVER_URL', 'buink-chatbot' ),  'buink_chatbot_field_server_url',  'buink-chatbot', 'buink_chatbot_main' );
    add_settings_field( 'buink_chatbot_api_key',    __( 'API_KEY', 'buink-chatbot' ),     'buink_chatbot_field_api_key',     'buink-chatbot', 'buink_chatbot_main' );
}

function buink_chatbot_field_widget_url(): void {
    $value = esc_attr( get_option( 'buink_chatbot_widget_url', '' ) );
    echo '<input type="url" id="buink_chatbot_widget_url" name="buink_chatbot_widget_url"
               class="regular-text" value="' . $value . '"
               placeholder="http://localhost:5173" />';
    echo '<p class="description">' . esc_html__( 'URL of the Buink chatbot frontend app (the iframe source).', 'buink-chatbot' ) . '</p>';
}

function buink_chatbot_field_server_url(): void {
    $value = esc_attr( get_option( 'buink_chatbot_server_url', '' ) );
    echo '<input type="url" id="buink_chatbot_server_url" name="buink_chatbot_server_url"
               class="regular-text" value="' . $value . '"
               placeholder="http://localhost:3001" />';
    echo '<p class="description">' . esc_html__( 'Backend Socket.IO server URL — passed to the app as the serverUrl query parameter.', 'buink-chatbot' ) . '</p>';
}

function buink_chatbot_field_api_key(): void {
    $value = esc_attr( get_option( 'buink_chatbot_api_key', '' ) );
    echo '<input type="password" id="buink_chatbot_api_key" name="buink_chatbot_api_key"
               class="regular-text" value="' . $value . '"
               placeholder="bk_…" autocomplete="off" />';
    echo '<p class="description">' . esc_html__( 'API key — passed to the app as the apiKey query parameter.', 'buink-chatbot' ) . '</p>';
}

function buink_chatbot_settings_page(): void {
    if ( ! current_user_can( 'manage_options' ) ) {
        return;
    }
    require BUINK_CHATBOT_DIR . 'admin/settings.php';
}

// ── Frontend widget ───────────────────────────────────────────────────────────

add_action( 'wp_enqueue_scripts', 'buink_chatbot_enqueue' );
function buink_chatbot_enqueue(): void {
    $widget_url = get_option( 'buink_chatbot_widget_url', '' );
    $server_url = get_option( 'buink_chatbot_server_url', '' );
    $api_key    = get_option( 'buink_chatbot_api_key', '' );

    if ( empty( $widget_url ) || empty( $server_url ) || empty( $api_key ) ) {
        return;
    }

    wp_enqueue_script(
        'buink-chatbot-widget',
        BUINK_CHATBOT_URL . 'assets/chatbot-widget.js',
        [],
        BUINK_CHATBOT_VERSION,
        true
    );

    // serverUrl and apiKey are passed as iframe data attributes + postMessage,
    // not as query params, so the iframe src stays clean.
    wp_localize_script(
        'buink-chatbot-widget',
        'BuinkChatbotConfig',
        [
            'iframeSrc' => esc_url( $widget_url ),
            'serverUrl' => esc_url( $server_url ),
            'apiKey'    => $api_key,
        ]
    );
}
