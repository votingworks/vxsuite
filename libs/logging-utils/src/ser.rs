use std::cell::Cell;

use serde::{
    ser::{SerializeSeq, Serializer},
    Serialize,
};

/// Makes a `Serializable` out of an iterable of `Serializable` values.
///
/// Note that this is not how serde serializers want to work, as they're
/// not supposed to have side effects. That means this is intended to be
/// used once, and if it's used multiple times the subsequent uses will
/// serialize an empty sequence.
pub fn iterator<I, P>(iterator: I) -> impl Serialize
where
    I: IntoIterator<Item = P>,
    P: Serialize,
{
    struct Adapter<T>(Cell<Option<T>>);

    impl<I, P> Serialize for Adapter<I>
    where
        I: IntoIterator<Item = P>,
        P: Serialize,
    {
        fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
            if let Some(iter) = self.0.take() {
                s.collect_seq(iter)
            } else {
                let seq = s.serialize_seq(None)?;
                seq.end()
            }
        }
    }

    Adapter(Cell::new(Some(iterator)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty() {
        assert_eq!(
            serde_json::to_string(&iterator(Vec::<u8>::new())).unwrap(),
            "[]"
        );
    }

    #[test]
    fn test_simple() {
        assert_eq!(
            serde_json::to_string(&iterator(vec![1, 2, 3])).unwrap(),
            "[1,2,3]"
        );
    }

    #[test]
    fn test_range() {
        assert_eq!(serde_json::to_string(&iterator(1..=3)).unwrap(), "[1,2,3]");
    }

    #[test]
    fn test_struct() {
        #[derive(Serialize)]
        struct Person {
            name: String,
            age: u16,
        }

        assert_eq!(
            serde_json::to_string(&iterator((20..=23).map(|age| Person {
                name: age.to_string(),
                age
            })))
            .unwrap(),
            r#"[{"name":"20","age":20},{"name":"21","age":21},{"name":"22","age":22},{"name":"23","age":23}]"#
        );
    }

    #[test]
    fn test_multiple_invocations() {
        let iter = iterator(1..=3);
        assert_eq!(serde_json::to_string(&iter).unwrap(), "[1,2,3]");
        assert_eq!(serde_json::to_string(&iter).unwrap(), "[]");
    }
}
