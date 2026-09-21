# Isolated mobile integration checks

These scripts only address loopback ports 14100 (Next) and 14300 (isolated Supabase gateway). Never point that gateway at production. They mutate synthetic data and the document suite deletes the synthetic account it creates. External AI, email, SMS, push and payment credentials must be disabled. Delivery and App Store purchase validation are separate release gates.

Set `T2Q_INTEGRATION_CONFIG_DIR` to a private directory outside the repository containing `private.json` with isolated `anon`, `service`, and synthetic `password`, and `users.json` with `alice` and `bob` entries containing `id`, `email`, `access_token` and `refresh_token`. The tokens must belong to the schema-only rehearsal database. Use mode 600 for these files. Refresh expired tokens through the isolated auth server.

Run with Python 3: `python3 scripts/mobile-integration/check_api.py`, then `check_documents_deletion.py`, `check_quote_controls.py` and `check_supplier_quote.py`. Failed assertions exit nonzero. Redacted JSON evidence and synthetic PDF fixtures are written to the private directory. Initial fixture setup may add six bucket-configuration checks to the document suite.

The native UI test reads ignored `ios-native/Tradies2QuoteUITests/IntegrationCredentials.json` containing only `anon`, `email` and `password` for synthetic Alice. It is excluded from the test bundle. Run `check_api.py` first to create its client/material fixtures. The shipping build cannot enable the loopback override; it is compiled only for Debug Simulator. Simulator tests require ad-hoc signing (`CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual`) for working Keychain storage. Do not disable Keychain to make tests pass.
