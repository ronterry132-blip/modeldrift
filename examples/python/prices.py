"""Intentional ModelDrift fixtures. USD per 1M tokens unless a key says otherwise."""

PRICES = {
    "gpt-4o": {"input": 999.0, "output": 999.0},
    "openai/gpt-4o": {"input": 999.0, "output": 999.0},
    "gpt-4-0314": {"input": 30.0, "output": 60.0},
    "gpt-4o-mini": {
        "input_cost_per_token": 1e-4,
        "output_cost_per_token": 2e-4,
    },
}
