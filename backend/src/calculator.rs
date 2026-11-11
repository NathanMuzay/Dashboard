//! Bounded arithmetic parser: numbers and + - * / (), never executable code.
use rust_decimal::Decimal;

fn normalize(text: &str) -> String {
    text.replace(',', ".")
        .replace(['×', 'x'], "*")
        .replace('÷', "/")
        .replace('−', "-")
}
fn literals(text: &str) -> Option<Vec<Decimal>> {
    let chars: Vec<char> = text.chars().collect();
    let mut result = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        if !chars[i].is_ascii_digit() {
            i += 1;
            continue;
        }
        let start = i;
        while i < chars.len()
            && (chars[i].is_ascii_digit()
                || (matches!(chars[i], '.' | ',')
                    && chars.get(i + 1).is_some_and(char::is_ascii_digit)))
        {
            i += 1;
        }
        result.push(
            Decimal::from_str_exact(&chars[start..i].iter().collect::<String>().replace(',', "."))
                .ok()?
                .normalize(),
        );
    }
    Some(result)
}
pub fn same_numbers(prompt: &str, expression: &str) -> bool {
    let (Some(mut source), Some(mut translated)) = (literals(prompt), literals(expression)) else {
        return false;
    };
    source.sort();
    translated.sort();
    source == translated && !source.is_empty()
}
pub fn is_expression(prompt: &str) -> bool {
    let normalized = normalize(prompt.trim());
    normalized.chars().any(|c| c.is_ascii_digit())
        && normalized
            .chars()
            .all(|c| c.is_ascii_digit() || c.is_ascii_whitespace() || ".+-*/()".contains(c))
}
pub fn wants_calculation(prompt: &str) -> bool {
    if is_expression(prompt) {
        return true;
    }
    let lower = prompt.to_lowercase();
    literals(prompt).is_some_and(|numbers| numbers.len() >= 2)
        && [
            "multipli",
            "soustra",
            "addition",
            "divis",
            "calcule",
            "calculer",
            "combien font",
            "somme",
            "produit",
            "subtract",
            "multiply",
            "calculate",
            " plus ",
            " moins ",
            " times ",
        ]
        .iter()
        .any(|word| lower.contains(word))
}
pub struct Calculation {
    pub expression: String,
    pub result: String,
    pub approximate: bool,
}
/// Inclusive integer interval; exclusions must be unique members of that interval.
pub fn sum_range(start: i64, end: i64, exclude: &[i64]) -> Result<Calculation, &'static str> {
    let count = i128::from(end) - i128::from(start) + 1;
    if !(1..=10_000).contains(&count) || exclude.len() > 100 {
        return Err(
            "Choisissez un intervalle croissant de 10 000 entiers maximum et au plus 100 exclusions.",
        );
    }
    let mut seen = std::collections::HashSet::new();
    if exclude
        .iter()
        .any(|n| *n < start || *n > end || !seen.insert(*n))
    {
        return Err(
            "Chaque nombre exclu doit apparaître une seule fois et appartenir à l’intervalle.",
        );
    }
    let total = (i128::from(start) + i128::from(end)) * count / 2
        - exclude.iter().map(|n| i128::from(*n)).sum::<i128>();
    let exclusions = if exclude.is_empty() {
        String::new()
    } else {
        format!(
            " (sauf {})",
            exclude
                .iter()
                .map(ToString::to_string)
                .collect::<Vec<_>>()
                .join(", ")
        )
    };
    Ok(Calculation {
        expression: format!("Somme des entiers de {start} à {end}{exclusions}"),
        result: total.to_string(),
        approximate: false,
    })
}
pub fn evaluate(expression: &str) -> Result<Calculation, &'static str> {
    let expression = normalize(expression);
    if expression.len() > 512
        || expression.is_empty()
        || !expression
            .chars()
            .all(|c| c.is_ascii_digit() || c.is_ascii_whitespace() || ".+-*/()".contains(c))
    {
        return Err(
            "Expression non prise en charge. Utilisez des nombres, +, -, *, / et des parenthèses.",
        );
    }
    let mut parser = Parser {
        bytes: expression.as_bytes(),
        index: 0,
        approximate: false,
    };
    let value = parser.expression(0)?;
    parser.space();
    if parser.index != parser.bytes.len() {
        return Err("Expression de calcul invalide.");
    }
    Ok(Calculation {
        expression: expression.replace('.', ",").replace('*', "×"),
        result: value.normalize().to_string().replace('.', ","),
        approximate: parser.approximate,
    })
}
struct Parser<'a> {
    bytes: &'a [u8],
    index: usize,
    approximate: bool,
}
impl Parser<'_> {
    fn space(&mut self) {
        while self
            .bytes
            .get(self.index)
            .is_some_and(u8::is_ascii_whitespace)
        {
            self.index += 1;
        }
    }
    fn take(&mut self, byte: u8) -> bool {
        self.space();
        if self.bytes.get(self.index) == Some(&byte) {
            self.index += 1;
            true
        } else {
            false
        }
    }
    fn expression(&mut self, depth: usize) -> Result<Decimal, &'static str> {
        let mut value = self.term(depth)?;
        loop {
            if self.take(b'+') {
                value = value
                    .checked_add(self.term(depth)?)
                    .ok_or("Résultat trop grand pour le calculateur.")?;
            } else if self.take(b'-') {
                value = value
                    .checked_sub(self.term(depth)?)
                    .ok_or("Résultat trop grand pour le calculateur.")?;
            } else {
                return Ok(value);
            }
        }
    }
    fn term(&mut self, depth: usize) -> Result<Decimal, &'static str> {
        let mut value = self.factor(depth)?;
        loop {
            if self.take(b'*') {
                let rhs = self.factor(depth)?;
                let result = value
                    .checked_mul(rhs)
                    .ok_or("Résultat trop grand pour le calculateur.")?;
                if !rhs.is_zero() && result.checked_div(rhs) != Some(value) {
                    self.approximate = true;
                }
                value = result;
            } else if self.take(b'/') {
                let rhs = self.factor(depth)?;
                if rhs.is_zero() {
                    return Err("La division par zéro est impossible.");
                }
                let result = value
                    .checked_div(rhs)
                    .ok_or("Résultat trop grand pour le calculateur.")?;
                if result.checked_mul(rhs) != Some(value) {
                    self.approximate = true;
                }
                value = result;
            } else {
                return Ok(value);
            }
        }
    }
    fn factor(&mut self, depth: usize) -> Result<Decimal, &'static str> {
        if depth > 32 {
            return Err("Expression trop imbriquée.");
        }
        if self.take(b'+') {
            return self.factor(depth + 1);
        }
        if self.take(b'-') {
            return self.factor(depth + 1).map(|value| -value);
        }
        if self.take(b'(') {
            let value = self.expression(depth + 1)?;
            if !self.take(b')') {
                return Err("Parenthèse manquante.");
            }
            return Ok(value);
        }
        self.space();
        let start = self.index;
        while self
            .bytes
            .get(self.index)
            .is_some_and(|c| c.is_ascii_digit() || *c == b'.')
        {
            self.index += 1;
        }
        let token =
            std::str::from_utf8(&self.bytes[start..self.index]).map_err(|_| "Nombre invalide.")?;
        Decimal::from_str_exact(token).map_err(|_| "Nombre invalide ou précision trop grande.")
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn inclusive_sum_handles_exclusions_and_bounds() {
        assert_eq!(sum_range(1, 12, &[11]).unwrap().result, "67");
        assert_eq!(sum_range(-3, 3, &[-1, 1]).unwrap().result, "0");
        assert_eq!(sum_range(12, 12, &[12]).unwrap().result, "0");
        assert!(sum_range(12, 1, &[]).is_err());
        assert!(sum_range(1, 12, &[13]).is_err());
        assert!(sum_range(1, 12, &[11, 11]).is_err());
        assert!(sum_range(i64::MIN, i64::MAX, &[]).is_err());
    }
    #[test]
    fn reported_decimal_regression_and_precedence() {
        assert_eq!(evaluate("12 * 3.1 * 2 - 31.4").unwrap().result, "43");
        assert_eq!(evaluate("12 × 3,1 × 2 − 31,4").unwrap().result, "43");
        assert_eq!(evaluate("0.1 + 0.2").unwrap().result, "0,3");
        assert_eq!(evaluate("(2 + 3) * -4").unwrap().result, "-20");
        assert_eq!(evaluate("10 / 4").unwrap().result, "2,5");
        assert!(evaluate("1 / 3").unwrap().approximate);
    }
    #[test]
    fn rejects_invalid_unsafe_and_unbounded_expressions() {
        for expression in [
            "1 / 0",
            "1; system('echo')",
            "1 +",
            "(1 + 2",
            "1 2",
            "2^3",
            "1..2",
            "",
        ] {
            assert!(evaluate(expression).is_err(), "{expression}");
        }
        assert!(evaluate(&format!("{}1{}", "(".repeat(40), ")".repeat(40))).is_err());
        assert!(evaluate("79228162514264337593543950335 * 2").is_err());
    }
    #[test]
    fn detects_calculations_and_rejects_invented_operands() {
        let question = "fais moi la multiplication des nombres 12 3.1 et 2 puis tu soustrait 31.4";
        assert!(wants_calculation(question));
        assert!(wants_calculation("12 * 3,1 * 2 - 31,4"));
        assert!(!wants_calculation("Explique ce qu’est une API"));
        assert!(same_numbers(question, "12 * 3.1 * 2 - 31.4"));
        assert!(!same_numbers(question, "123.1 - 31.4"));
        assert!(!same_numbers(question, "12 * 3.1 * 2 - 31.4 + 1"));
    }
}
