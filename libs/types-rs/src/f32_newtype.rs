/// Creates a newtype for `f32` that can act like it, but is distinct from it.
macro_rules! f32_newtype {
    ($name:ident) => {
        #[derive(Copy, Clone, Debug, PartialEq, Serialize, Deserialize)]
        #[must_use]
        pub struct $name(f32);

        impl $name {
            pub const INFINITY: Self = Self(f32::INFINITY);
            pub const NEG_INFINITY: Self = Self(f32::NEG_INFINITY);
            pub const NAN: Self = Self(f32::NAN);

            pub const fn new(value: f32) -> Self {
                Self(value)
            }

            #[must_use]
            pub const fn get(&self) -> f32 {
                self.0
            }

            #[must_use]
            pub fn is_infinite(&self) -> bool {
                self.0.is_infinite()
            }

            #[must_use]
            pub fn is_nan(&self) -> bool {
                self.0.is_nan()
            }

            pub fn abs(&self) -> Self {
                Self(self.0.abs())
            }
        }

        impl ::std::default::Default for $name {
            fn default() -> Self {
                Self(Default::default())
            }
        }

        impl ::std::ops::Add for $name {
            type Output = Self;

            fn add(self, rhs: Self) -> Self::Output {
                Self(self.0 + rhs.0)
            }
        }

        impl ::std::ops::AddAssign for $name {
            fn add_assign(&mut self, rhs: Self) {
                self.0 += rhs.0;
            }
        }

        impl ::std::ops::Sub for $name {
            type Output = Self;

            fn sub(self, rhs: Self) -> Self::Output {
                Self(self.0 - rhs.0)
            }
        }

        impl ::std::ops::SubAssign for $name {
            fn sub_assign(&mut self, rhs: Self) {
                self.0 -= rhs.0;
            }
        }

        impl ::std::ops::Neg for $name {
            type Output = Self;

            fn neg(self) -> Self::Output {
                Self(-self.0)
            }
        }

        impl ::std::ops::Mul<f32> for $name {
            type Output = Self;

            fn mul(self, rhs: f32) -> Self::Output {
                Self(self.0 * rhs)
            }
        }

        impl ::std::ops::Mul<$name> for f32 {
            type Output = $name;

            fn mul(self, rhs: $name) -> Self::Output {
                $name(self * rhs.0)
            }
        }

        impl ::std::ops::Div<f32> for $name {
            type Output = Self;

            fn div(self, rhs: f32) -> Self::Output {
                Self(self.0 / rhs)
            }
        }

        impl ::std::ops::Div<$name> for f32 {
            type Output = $name;

            fn div(self, rhs: $name) -> Self::Output {
                $name(self / rhs.0)
            }
        }

        impl ::std::ops::Rem for $name {
            type Output = Self;

            fn rem(self, rhs: Self) -> Self::Output {
                Self(self.0 % rhs.0)
            }
        }

        impl ::std::cmp::Eq for $name {}

        impl ::std::cmp::PartialOrd for $name {
            fn partial_cmp(&self, other: &Self) -> Option<::std::cmp::Ordering> {
                Some(self.cmp(other))
            }
        }

        impl ::std::cmp::Ord for $name {
            fn cmp(&self, other: &Self) -> ::std::cmp::Ordering {
                self.0
                    .partial_cmp(&other.0)
                    .unwrap_or(::std::cmp::Ordering::Equal)
            }
        }
    };
}

pub(crate) use f32_newtype;
