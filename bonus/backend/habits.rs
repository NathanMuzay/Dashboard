use crate::error::ApiError;
use serde_json::Value;
use std::collections::HashSet;

fn valid_day(day: &str) -> bool {
    let bytes = day.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || bytes
            .iter()
            .enumerate()
            .any(|(i, c)| i != 4 && i != 7 && !c.is_ascii_digit())
    {
        return false;
    }
    let year: u32 = day[..4].parse().unwrap_or(0);
    let month: u32 = day[5..7].parse().unwrap_or(0);
    let date: u32 = day[8..].parse().unwrap_or(0);
    let max = match month {
        4 | 6 | 9 | 11 => 30,
        2 if year % 4 == 0 => 29,
        2 => 28,
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        _ => 0,
    };
    (2000..=2099).contains(&year) && date >= 1 && date <= max
}

pub fn validate(value: &Value) -> Result<(), ApiError> {
    let invalid = || {
        ApiError::invalid(
            "Habitudes invalides : 20 lignes maximum, noms de 1 à 80 caractères et historique de 3 660 dates uniques par ligne.",
        )
    };
    let habits = value.as_array().ok_or_else(invalid)?;
    if habits.len() > 20 {
        return Err(invalid());
    }
    let mut ids = HashSet::new();
    for habit in habits {
        let obj = habit.as_object().ok_or_else(invalid)?;
        if obj.len() != 3
            || obj
                .keys()
                .any(|key| !["id", "name", "days"].contains(&key.as_str()))
        {
            return Err(invalid());
        }
        let id = habit["id"].as_str().ok_or_else(invalid)?;
        let name = habit["name"].as_str().ok_or_else(invalid)?;
        if id.is_empty()
            || id.len() > 64
            || !id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
            || !ids.insert(id)
            || name.trim().is_empty()
            || name.encode_utf16().count() > 80
        {
            return Err(invalid());
        }
        let days = habit["days"].as_array().ok_or_else(invalid)?;
        if days.len() > 3660 {
            return Err(invalid());
        }
        let mut unique = HashSet::new();
        for day in days {
            let day = day.as_str().ok_or_else(invalid)?;
            if !valid_day(day) || !unique.insert(day) {
                return Err(invalid());
            }
        }
    }
    Ok(())
}
