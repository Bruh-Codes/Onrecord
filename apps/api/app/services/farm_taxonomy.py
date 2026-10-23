"""Agriculture labels are independent of the existing document-ledger taxonomy."""

TEMPLATES = {
    "crop": {
        "subtypes": ["tomato", "maize", "rice", "cassava", "cocoa", "other"],
        "income": ["Produce sales", "Other farm income"],
        "expense": ["Seeds", "Fertilizer", "Labour", "Land preparation", "Irrigation", "Transport", "Packaging", "Equipment", "Maintenance", "Other farm cost"],
    },
    "livestock": {
        "subtypes": ["broilers", "layers", "goats", "cattle", "other"],
        "income": ["Egg sales", "Animal sales", "Milk sales", "Other farm income"],
        "expense": ["Bird purchase", "Animal purchase", "Feed", "Veterinary", "Utilities", "Labour", "Transport", "Equipment", "Maintenance", "Other farm cost"],
    },
    "aquaculture": {
        "subtypes": ["tilapia", "catfish", "other"],
        "income": ["Fish sales", "Other farm income"],
        "expense": ["Fingerlings", "Feed", "Medication", "Power", "Harvesting", "Labour", "Transport", "Equipment", "Maintenance", "Other farm cost"],
    },
}
OVERHEAD_CATEGORIES = ["General overhead", "Shared electricity", "Shared transport", "Administration"]
