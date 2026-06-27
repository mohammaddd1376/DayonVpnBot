import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Payment } from './payment.entity';
import { PaymentStatus } from './payment.entity';


@Injectable()
export class PaymentsService {

  constructor(
    @InjectRepository(Payment)
    private repo: Repository<Payment>,
  ) { }



  create(data: any) {

    return this.repo.save({
      ...data,
      status: PaymentStatus.PENDING,
    });

  }

  async findoneById(id: number) {
   return await this.repo.findOneBy({ id })
  }

  async approve(id: number) {

    const payment =
      await this.repo.findOne({
        where: { id },
        relations: [
          'user',
          'plan',
        ],
      });


    if (!payment) {
      throw new Error('Payment not found');
    }


    payment.status =
      PaymentStatus.APPROVED;


    return this.repo.save(payment);

  }




  async reject(id: number) {

    const payment =
      await this.repo.findOne({
        where: { id },
      });


    if (!payment) {
      throw new Error('Payment not found');
    }


    payment.status =
      PaymentStatus.REJECTED;


    return this.repo.save(payment);

  }

}