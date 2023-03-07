// Defines a new type that wraps a String for use as an ID.
macro_rules! idtype {
    ($name:ident) => {
        #[derive(Clone, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
        pub struct $name(String);

        impl $name {
            #[allow(dead_code)]
            pub const fn from(s: String) -> Self {
                Self(s)
            }
        }

        impl std::fmt::Display for $name {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                write!(f, "{}", self.0)
            }
        }
    };
}

pub(crate) use idtype;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_idtype() {
        idtype!(Foo);
        let foo = Foo::from("foo".to_string());
        assert_eq!(format!("{}", foo), "foo");
        assert_eq!(serde_json::to_string(&foo).unwrap(), r#""foo""#);
        assert_eq!(
            serde_json::from_str::<Foo>(r#""foo""#).unwrap(),
            Foo::from("foo".to_string())
        );
    }

    #[test]
    fn test_idtype_clone() {
        idtype!(Foo);
        let foo = Foo::from("foo".to_string());
        let foo2 = foo.clone();
        assert_eq!(foo, foo2);
    }
}
