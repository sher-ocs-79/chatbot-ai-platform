<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}
?>
<div class="wrap">
    <h1><?php esc_html_e( 'Buink Chatbot Settings', 'buink-chatbot' ); ?></h1>

    <?php settings_errors( 'buink_chatbot_options' ); ?>

    <?php
    $widget_url = get_option( 'buink_chatbot_widget_url', '' );
    $server_url = get_option( 'buink_chatbot_server_url', '' );
    $api_key    = get_option( 'buink_chatbot_api_key', '' );
    $configured = ! empty( $widget_url ) && ! empty( $server_url ) && ! empty( $api_key );
    ?>

    <?php if ( $configured ) : ?>
        <div class="notice notice-success inline">
            <p><?php esc_html_e( 'Widget is active and will appear on all front-end pages.', 'buink-chatbot' ); ?></p>
        </div>
    <?php else : ?>
        <div class="notice notice-warning inline">
            <p><?php esc_html_e( 'Fill in all three fields below to activate the chat widget.', 'buink-chatbot' ); ?></p>
        </div>
    <?php endif; ?>

    <form method="post" action="options.php">
        <?php
        settings_fields( 'buink_chatbot_options' );
        do_settings_sections( 'buink-chatbot' );
        submit_button( __( 'Save Settings', 'buink-chatbot' ) );
        ?>
    </form>
</div>
