import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';
import moment from 'moment-timezone';

@ValidatorConstraint({ name: 'IsValidTimezone', async: false })
export class IsValidTimezone implements ValidatorConstraintInterface {
  validate(timezone: string, args: ValidationArguments) {
    if (!timezone) return true; // Allow empty timezone (optional)
    return moment.tz.zone(timezone) !== null; // Check if timezone is valid
  }

  defaultMessage(args: ValidationArguments) {
    return 'Invalid timezone';
  }
}